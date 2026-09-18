import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/services/transaction";
import type { Page, ProductDto } from "@/lib/types";
import type { CreateProductInput, DeleteProductInput, ProductListInput, UpdateProductInput } from "@/lib/validation/schemas";

/** The columns that may leave the service: never userId or deletedAt. */
type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unitPrice: number;
  quantityOnHand: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

const NOT_FOUND = { code: "NOT_FOUND", message: "Product not found" } as const;
const skuConflict = (): AppError => new AppError(409, "DUPLICATE_SKU", "SKU already exists", { sku: ["This SKU is already in use"] });
const notFound = (): AppError => new AppError(404, NOT_FOUND.code, NOT_FOUND.message);
const versionConflict = (): AppError => new AppError(409, "VERSION_CONFLICT", "The product changed; reload and retry");

/** Soft-deleted rows stay invisible to every normal read, including their reserved SKU. */
const activeRow = (userId: string, id: string) => ({ id, userId, deletedAt: null }) as const;

const toProductDto = (row: ProductRow): ProductDto => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  description: row.description,
  unitPrice: row.unitPrice,
  quantityOnHand: row.quantityOnHand,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** The only unique constraint on Product is (userId, sku). */
const isSkuCollision = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * `contains` compiles to an ILIKE pattern, so `%` and `_` would stay wildcards and a lone `%`
 * would match every row. Escape them (and the escape character itself) to keep search literal.
 */
const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (character) => `\\${character}`);

export async function listProducts(userId: string, query: ProductListInput): Promise<Page<ProductDto>> {
  const search = escapeLikePattern(query.search);
  const where: Prisma.ProductWhereInput = {
    userId,
    deletedAt: null,
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    getPrisma().product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPrisma().product.count({ where }),
  ]);
  return {
    data: rows.map(toProductDto),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize) },
  };
}

export async function getProduct(userId: string, id: string): Promise<ProductDto> {
  const row = await getPrisma().product.findFirst({ where: activeRow(userId, id) });
  if (!row) throw notFound();
  return toProductDto(row);
}

export async function createProduct(userId: string, input: CreateProductInput): Promise<ProductDto> {
  try {
    const row = await getPrisma().product.create({
      data: {
        userId,
        sku: input.sku,
        name: input.name,
        description: input.description ?? null,
        unitPrice: input.unitPrice,
        quantityOnHand: input.quantityOnHand,
      },
    });
    return toProductDto(row);
  } catch (error) {
    // The database constraint is the race-free check; a soft-deleted row still reserves its SKU.
    if (isSkuCollision(error)) throw skuConflict();
    throw error;
  }
}

export async function updateProduct(userId: string, id: string, input: UpdateProductInput): Promise<ProductDto> {
  const { version, ...changes } = input;
  const data: Prisma.ProductUpdateManyMutationInput = { version: { increment: 1 } };
  for (const [field, value] of Object.entries(changes)) {
    if (value !== undefined) (data as Record<string, unknown>)[field] = value;
  }
  try {
    return await withSerializableRetry(async (tx) => {
      // Existence first, so an unowned or deleted row is 404 while a live mismatch is 409.
      if (!(await tx.product.findFirst({ where: activeRow(userId, id), select: { id: true } }))) throw notFound();
      const { count } = await tx.product.updateMany({ where: { ...activeRow(userId, id), version }, data });
      if (count === 0) throw versionConflict();
      return toProductDto(await tx.product.findUniqueOrThrow({ where: { id } }));
    });
  } catch (error) {
    if (isSkuCollision(error)) throw skuConflict();
    throw error;
  }
}

export async function deleteProduct(userId: string, id: string, input: DeleteProductInput): Promise<void> {
  await withSerializableRetry(async (tx) => {
    if (!(await tx.product.findFirst({ where: activeRow(userId, id), select: { id: true } }))) throw notFound();
    const { count } = await tx.product.updateMany({
      where: { ...activeRow(userId, id), version: input.version },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (count === 0) throw versionConflict();
  });
}
