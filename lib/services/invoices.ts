import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { readEnv } from "@/lib/env";
import { AppError } from "@/lib/http";
import { calculateTotals } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/services/transaction";
import type { InvoiceDetailDto, InvoiceItemDto, InvoiceStatus, InvoiceSummaryDto, Page } from "@/lib/types";
import type { CreateInvoiceInput, InvoiceLineInput, InvoiceListInput, ReplaceInvoiceItemsInput } from "@/lib/validation/schemas";

/** Columns that may leave the service: never userId. */
type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  notes: string | null;
  taxRateBps: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type ItemRow = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  position: number;
};

type InvoiceWithItems = InvoiceRow & { items: ItemRow[] };

/** A validated line ready to be persisted: snapshots plus position, never a client price. */
type SnapshotLine = Omit<ItemRow, "id">;

const notFound = (): AppError => new AppError(404, "NOT_FOUND", "Invoice not found");

/** Foreign, unknown and soft-deleted products are indistinguishable on purpose; the line is named. */
const productNotFound = (index: number): AppError =>
  new AppError(404, "NOT_FOUND", "Product not found", { [`items.${index}.productId`]: ["Product not found"] });

const insufficientStock = (index: number, available: number, name: string): AppError =>
  new AppError(409, "INSUFFICIENT_STOCK", `Only ${available} of ${name} are in stock`, {
    [`items.${index}.quantity`]: [`Quantity must be at most ${available}, the current stock of ${name}`],
  });

const versionConflict = (): AppError => new AppError(409, "VERSION_CONFLICT", "The invoice changed; reload and retry");
const notEditable = (): AppError => new AppError(409, "INVOICE_NOT_EDITABLE", "Only draft invoices can have their items replaced");

const DRAFT_ONLY = { status: "DRAFT" } as const;
const ITEMS_ASCENDING = { items: { orderBy: { position: "asc" } } } as const;

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const toStoredDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const toSummaryDto = (row: InvoiceRow): InvoiceSummaryDto => ({
  id: row.id,
  invoiceNumber: row.invoiceNumber,
  customerName: row.customerName,
  issueDate: dateOnly(row.issueDate),
  dueDate: dateOnly(row.dueDate),
  status: row.status,
  notes: row.notes,
  taxRateBps: row.taxRateBps,
  subtotal: row.subtotal,
  taxAmount: row.taxAmount,
  total: row.total,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toItemDto = (row: ItemRow): InvoiceItemDto => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  unitPrice: row.unitPrice,
  quantity: row.quantity,
  lineTotal: row.lineTotal,
  position: row.position,
});

const toDetailDto = (row: InvoiceWithItems): InvoiceDetailDto => ({ ...toSummaryDto(row), items: row.items.map(toItemDto) });

/**
 * Deliberately nonsequential and id-derived (`INV-<UTC year>-<invoice uuid>`), never count+1, so two
 * concurrent drafts cannot collide on the unique invoice number.
 */
export function generateInvoiceNumber(id: string, createdAt: Date): string {
  return `INV-${createdAt.getUTCFullYear()}-${id}`;
}

/** Own active products only; owners and stock are validated before any snapshot is written. */
async function loadOwnedProducts(tx: Prisma.TransactionClient, userId: string, productIds: string[]) {
  const products = await tx.product.findMany({ where: { id: { in: productIds }, userId, deletedAt: null } });
  return new Map(products.map((product) => [product.id, product]));
}

/**
 * Builds the persisted lines for a draft. Existing lines of this invoice keep their snapshotted name
 * and price, so editing a draft never rewrites history; newly added products take current data.
 * Stock is validated (not reserved) for every line, and the caller's arithmetic bounds still apply.
 */
async function snapshotItems(
  tx: Prisma.TransactionClient,
  userId: string,
  lines: readonly InvoiceLineInput[],
  existing: readonly ItemRow[],
): Promise<SnapshotLine[]> {
  const retained = new Map(existing.map((item) => [item.productId, item]));
  const products = await loadOwnedProducts(tx, userId, lines.map((line) => line.productId));

  return lines.map((line, position) => {
    const product = products.get(line.productId);
    if (!product) throw productNotFound(position);
    if (line.quantity > product.quantityOnHand) throw insufficientStock(position, product.quantityOnHand, product.name);
    const snapshot = retained.get(line.productId);
    const unitPrice = snapshot?.unitPrice ?? product.unitPrice;
    const productName = snapshot?.productName ?? product.name;
    return { productId: line.productId, productName, unitPrice, quantity: line.quantity, lineTotal: unitPrice * line.quantity, position };
  });
}

export async function listInvoices(userId: string, query: InvoiceListInput): Promise<Page<InvoiceSummaryDto>> {
  const where: Prisma.InvoiceWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    getPrisma().invoice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPrisma().invoice.count({ where }),
  ]);
  return {
    data: rows.map(toSummaryDto),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize) },
  };
}

export async function getInvoice(userId: string, id: string): Promise<InvoiceDetailDto> {
  const row = await getPrisma().invoice.findFirst({ where: { id, userId }, include: ITEMS_ASCENDING });
  if (!row) throw notFound();
  return toDetailDto(row);
}

/** Creates a draft: snapshots current product data, stores the configured tax rate, reserves nothing. */
export async function createInvoice(userId: string, input: CreateInvoiceInput): Promise<InvoiceDetailDto> {
  // Read configuration before opening a transaction: an invalid TAX_RATE_BPS must not half-write.
  const taxRateBps = readEnv(process.env).taxRateBps;
  const id = randomUUID();
  const createdAt = new Date();

  return withSerializableRetry(async (tx) => {
    const snapshots = await snapshotItems(tx, userId, input.items, []);
    const totals = calculateTotals(snapshots, taxRateBps);
    const row = await tx.invoice.create({
      data: {
        id,
        userId,
        invoiceNumber: generateInvoiceNumber(id, createdAt),
        customerName: input.customerName,
        issueDate: toStoredDate(input.issueDate),
        dueDate: toStoredDate(input.dueDate),
        status: "DRAFT",
        notes: input.notes ?? null,
        taxRateBps,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        createdAt,
        items: { create: snapshots },
      },
      include: ITEMS_ASCENDING,
    });
    return toDetailDto(row);
  });
}

export async function replaceInvoiceItems(userId: string, id: string, input: ReplaceInvoiceItemsInput): Promise<InvoiceDetailDto> {
  return withSerializableRetry(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, userId }, include: ITEMS_ASCENDING });
    if (!invoice) throw notFound();
    if (invoice.status !== "DRAFT") throw notEditable();
    if (invoice.version !== input.version) throw versionConflict();

    const snapshots = await snapshotItems(tx, userId, input.items, invoice.items);
    const totals = calculateTotals(snapshots, invoice.taxRateBps);

    // The conditional update is the race-safe claim: a concurrent edit changes version/status first.
    const { count } = await tx.invoice.updateMany({
      where: { id, userId, ...DRAFT_ONLY, version: input.version },
      data: { subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total, version: { increment: 1 } },
    });
    if (count === 0) throw versionConflict();

    // Whole-set replacement inside one transaction: a failed insert rolls the delete back too.
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoiceItem.createMany({ data: snapshots.map((snapshot) => ({ invoiceId: id, ...snapshot })) });
    const updated = await tx.invoice.findUniqueOrThrow({ where: { id }, include: ITEMS_ASCENDING });
    return toDetailDto(updated);
  });
}

