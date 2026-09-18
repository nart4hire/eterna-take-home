import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { readEnv } from "@/lib/env";
import { AppError } from "@/lib/http";
import { calculateTotals } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/services/transaction";
import type { InvoiceDetailDto, InvoiceItemDto, InvoiceStatus, InvoiceSummaryDto, Page } from "@/lib/types";
import type { CreateInvoiceInput, InvoiceLineInput, InvoiceListInput, ReplaceInvoiceItemsInput, TransitionInvoiceInput } from "@/lib/validation/schemas";

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

/** The legal edges of the lifecycle; every other pair is a state conflict. */
const LEGAL_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

/** Matches the migration CHECK `quantityOnHand BETWEEN 0 AND 1000000` and the products schema bound. */
const MAX_STOCK = 1000000;

/** Item-edit conflict code with a transition-specific message (coordinator ruling on T06 item 5). */
const transitionConflict = (from: InvoiceStatus, to: InvoiceStatus): AppError =>
  new AppError(409, "INVOICE_NOT_EDITABLE", `Invoice status cannot change from ${from} to ${to}`);

/**
 * A restore that would exceed the stock bound is a conflict rather than a constraint violation, so the
 * caller can roll the whole cancellation back and report why. There is no client field to correct, so
 * the 409 carries a message only (the manual stock write has to be lowered first).
 */
const stockOverflow = (name: string, available: number): AppError =>
  new AppError(409, "STOCK_OVERFLOW", `Restoring the ${name} line would push its stock above the maximum (${available} on hand)`);

/** Deterministic lock order: concurrent issues queue on the same products in the same sequence. */
const sortByProduct = (items: readonly ItemRow[]): ItemRow[] =>
  [...items].sort((left, right) => (left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0));

/**
 * Legal transitions only: DRAFT -> ISSUED | CANCELLED and ISSUED -> PAID | CANCELLED. PAID and
 * CANCELLED are terminal, so a repeated or illegal action is a 409 and never repeats a stock effect.
 */
export function assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!LEGAL_TRANSITIONS[from].includes(to)) throw transitionConflict(from, to);
}

/**
 * Deducts every line at issue with an owner/active/quantity-gte conditional update. The guard is the
 * race-safe claim: a concurrent issue that already consumed the stock leaves `count` at zero. Sorted
 * writes plus "throw on any failed update" make all lines commit or none.
 */
async function deductStock(tx: Prisma.TransactionClient, userId: string, items: readonly ItemRow[]): Promise<void> {
  for (const item of sortByProduct(items)) {
    const { count } = await tx.product.updateMany({
      where: { id: item.productId, userId, deletedAt: null, quantityOnHand: { gte: item.quantity } },
      data: { quantityOnHand: { decrement: item.quantity }, version: { increment: 1 } },
    });
    if (count === 0) {
      // The failed guard is the evidence; the re-read only names the product and its current stock.
      const product = await tx.product.findFirst({
        where: { id: item.productId, userId },
        select: { name: true, quantityOnHand: true, deletedAt: true },
      });
      if (!product || product.deletedAt) throw productNotFound(item.position);
      throw insufficientStock(item.position, product.quantityOnHand, product.name);
    }
  }
}

/**
 * Restores every line of an issued invoice once, including lines whose product was soft-deleted after
 * the issue. The `lte` guard turns an overflowing restore into an explicit 409 that rolls the whole
 * cancellation back, and `userId` keeps the write inside the invoice owner's products.
 */
async function restoreStock(tx: Prisma.TransactionClient, userId: string, items: readonly ItemRow[]): Promise<void> {
  for (const item of sortByProduct(items)) {
    const { count } = await tx.product.updateMany({
      where: { id: item.productId, userId, quantityOnHand: { lte: MAX_STOCK - item.quantity } },
      data: { quantityOnHand: { increment: item.quantity }, version: { increment: 1 } },
    });
    if (count === 0) {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
        select: { name: true, quantityOnHand: true },
      });
      throw stockOverflow(product.name, product.quantityOnHand);
    }
  }
}

/**
 * Version-guarded lifecycle transition. Existence, state and version are checked before anything is
 * written, the conditional status claim is the race-safe step, and the stock effect commits or rolls
 * back with it — so a failed line leaves neither a deduction nor a new status. Serializable retries
 * cover concurrent issues and cancellations, and each stock change increments the product version.
 */
export async function transitionInvoice(userId: string, id: string, input: TransitionInvoiceInput): Promise<InvoiceDetailDto> {
  return withSerializableRetry(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, userId }, include: ITEMS_ASCENDING });
    if (!invoice) throw notFound();
    assertTransition(invoice.status, input.status);
    if (invoice.version !== input.version) throw versionConflict();

    const { count } = await tx.invoice.updateMany({
      where: { id, userId, status: invoice.status, version: input.version },
      data: { status: input.status, version: { increment: 1 } },
    });
    if (count === 0) throw versionConflict();

    if (invoice.status === "DRAFT" && input.status === "ISSUED") await deductStock(tx, userId, invoice.items);
    if (invoice.status === "ISSUED" && input.status === "CANCELLED") await restoreStock(tx, userId, invoice.items);

    const updated = await tx.invoice.findUniqueOrThrow({ where: { id }, include: ITEMS_ASCENDING });
    return toDetailDto(updated);
  });
}

