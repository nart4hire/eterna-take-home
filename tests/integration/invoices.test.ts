import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET as getInvoiceRoute } from "@/app/api/invoices/[id]/route";
import { PUT as replaceItemsRoute } from "@/app/api/invoices/[id]/items/route";
import { GET as listInvoicesRoute, POST as createInvoiceRoute } from "@/app/api/invoices/route";
import { calculateTotals } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import type { InvoiceDetailDto, InvoiceStatus, InvoiceSummaryDto, Page, ProductDto } from "@/lib/types";
import { createProductFixture, makeRequest, readErrorBody, registerAndLogin, withCookie } from "../helpers";

afterAll(async () => { await getPrisma().$disconnect(); });

/** The exact trusted origin the test runner exports as BETTER_AUTH_URL. */
const TRUSTED_ORIGIN = "http://localhost:3100";

/** Route-handler contexts for the dynamic invoice segments. */
const detail = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonInit = (method: string, body: unknown, cookie?: string, headers: Record<string, string> = {}): RequestInit => {
  const merged = new Headers(headers);
  if (cookie) merged.set("cookie", cookie);
  return { method, body: typeof body === "string" ? body : JSON.stringify(body), headers: merged };
};

const list = (cookie: string, query = ""): Promise<Response> =>
  listInvoicesRoute(makeRequest(`/api/invoices${query ? `?${query}` : ""}`, withCookie(cookie)));

const create = (cookie: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  createInvoiceRoute(makeRequest("/api/invoices", jsonInit("POST", body, cookie, headers)));

const read = (cookie: string, id: string): Promise<Response> =>
  getInvoiceRoute(makeRequest(`/api/invoices/${id}`, withCookie(cookie)), detail(id));

const replace = (cookie: string, id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  replaceItemsRoute(makeRequest(`/api/invoices/${id}/items`, jsonInit("PUT", body, cookie, headers)), detail(id));

const pageOf = async (response: Response): Promise<Page<InvoiceSummaryDto>> => (await response.json()) as Page<InvoiceSummaryDto>;
const detailOf = async (response: Response): Promise<InvoiceDetailDto> => ((await response.json()) as { data: InvoiceDetailDto }).data;
const line = (product: ProductDto, quantity: number) => ({ productId: product.id, quantity });

/** Exact public key sets: a leaked userId or deletedAt must fail these assertions. */
const summaryKeys = ["createdAt", "customerName", "dueDate", "id", "invoiceNumber", "issueDate", "notes", "status", "subtotal", "taxAmount", "taxRateBps", "total", "updatedAt", "version"];
const itemKeys = ["id", "lineTotal", "position", "productId", "productName", "quantity", "unitPrice"];

const invoiceBody = (items: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  customerName: "Acme Distributors",
  issueDate: "2026-09-01",
  dueDate: "2026-09-30",
  notes: "Net 30",
  items,
  ...overrides,
});

type FixtureInvoice = { id: string; version: number; subtotal: number; taxAmount: number; total: number };

type FixtureOverrides = {
  status?: InvoiceStatus;
  customerName?: string;
  taxRateBps?: number;
  createdAt?: Date;
  issueDate?: string;
  dueDate?: string;
  version?: number;
  notes?: string | null;
};

/**
 * Non-draft and ordering fixtures are written straight through Prisma: the status route belongs to
 * T07, so draft tests must not depend on it. Totals use the shared integer money helper.
 */
async function createInvoiceFixture(userId: string, lines: { product: ProductDto; quantity: number }[], overrides: FixtureOverrides = {}): Promise<FixtureInvoice> {
  const taxRateBps = overrides.taxRateBps ?? 1100;
  const totals = calculateTotals(lines.map(({ product, quantity }) => ({ unitPrice: product.unitPrice, quantity })), taxRateBps);
  const id = randomUUID();
  const createdAt = overrides.createdAt ?? new Date();
  const row = await getPrisma().invoice.create({
    data: {
      id,
      userId,
      invoiceNumber: `INV-${createdAt.getUTCFullYear()}-${id}`,
      customerName: overrides.customerName ?? `Fixture Customer ${id.slice(0, 8)}`,
      issueDate: new Date(`${overrides.issueDate ?? "2026-09-01"}T00:00:00.000Z`),
      dueDate: new Date(`${overrides.dueDate ?? "2026-09-30"}T00:00:00.000Z`),
      status: overrides.status ?? "DRAFT",
      notes: overrides.notes ?? null,
      taxRateBps,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      version: overrides.version ?? 0,
      createdAt,
      items: {
        create: lines.map(({ product, quantity }, position) => ({
          productId: product.id,
          productName: product.name,
          unitPrice: product.unitPrice,
          quantity,
          lineTotal: product.unitPrice * quantity,
          position,
        })),
      },
    },
  });
  return { id: row.id, version: row.version, subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total };
}

/** Owned products with deterministic prices/stock so totals can be asserted exactly. */
async function ownedProducts(userId: string, specs: [string, number, number][]): Promise<ProductDto[]> {
  const products: ProductDto[] = [];
  for (const [sku, unitPrice, quantityOnHand] of specs) {
    products.push(await createProductFixture(userId, { sku, name: `Widget ${sku}`, unitPrice, quantityOnHand }));
  }
  return products;
}

const softDeleteProduct = (id: string): Promise<unknown> =>
  getPrisma().product.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });

/** Runs work with a temporary TAX_RATE_BPS value and always restores the runner's environment. */
async function withTaxRate<T>(value: string, work: () => Promise<T>): Promise<T> {
  const previous = process.env.TAX_RATE_BPS;
  process.env.TAX_RATE_BPS = value;
  try { return await work(); } finally { process.env.TAX_RATE_BPS = previous; }
}

describe("A6: every invoice draft method requires credentials before parsing input", () => {
  it("returns 401 for list/create/detail/replace even with malformed input", async () => {
    const responses: Response[] = [
      await listInvoicesRoute(makeRequest("/api/invoices?page=0&bogus=1")),
      await createInvoiceRoute(makeRequest("/api/invoices", { method: "POST", body: "{not json" })),
      await getInvoiceRoute(makeRequest("/api/invoices/not-a-uuid"), detail("not-a-uuid")),
      await replaceItemsRoute(makeRequest("/api/invoices/not-a-uuid/items", { method: "PUT", body: "{}" }), detail("not-a-uuid")),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await readErrorBody(response)).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
  });

  it("returns 401 for an unknown or copied session cookie", async () => {
    const response = await listInvoicesRoute(makeRequest("/api/invoices", withCookie("better-auth.session_token=forged-token")));
    expect(response.status).toBe(401);
    expect((await readErrorBody(response)).error.code).toBe("UNAUTHORIZED");
  });
});

describe("A6 N6: authenticated invoice mutations reject a missing or foreign Origin", () => {
  it("returns 403 and writes nothing for missing/foreign origins", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ORIG-1", 1299, 10]]);
    const body = invoiceBody([line(product!, 1)]);

    const foreign = await create(owner.cookie, body, { origin: "http://evil.example" });
    expect(foreign.status).toBe(403);
    expect(await readErrorBody(foreign)).toEqual({ error: { code: "ORIGIN_REJECTED", message: "Request origin is not allowed" } });

    const withoutOrigin = new Request(new URL("/api/invoices", TRUSTED_ORIGIN), {
      method: "POST",
      headers: { cookie: owner.cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect((await createInvoiceRoute(withoutOrigin)).status).toBe(403);

    const invoice = await createInvoiceFixture(owner.user.id, [{ product: product!, quantity: 1 }]);
    const foreignReplace = await replace(owner.cookie, invoice.id, { version: 0, items: [line(product!, 2)] }, { origin: "http://evil.example" });
    expect(foreignReplace.status).toBe(403);

    expect(await getPrisma().invoice.count()).toBe(1);
    expect(await getPrisma().invoiceItem.count()).toBe(1);
    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: product!.id } })).quantityOnHand).toBe(10);
  });
});

describe("A7 N6: invoices and their product references are strictly owner-scoped", () => {
  it("hides another user's invoice and refuses to read or replace it", async () => {
    const alice = await registerAndLogin();
    const bob = await registerAndLogin();
    const [aliceProduct] = await ownedProducts(alice.user.id, [["ALICE-1", 1299, 5]]);
    const invoice = await createInvoiceFixture(alice.user.id, [{ product: aliceProduct!, quantity: 2 }]);

    expect(await pageOf(await list(bob.cookie))).toEqual({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });

    const foreignRead = await read(bob.cookie, invoice.id);
    const foreignReplace = await replace(bob.cookie, invoice.id, { version: 0, items: [line(aliceProduct!, 1)] });
    expect([foreignRead.status, foreignReplace.status]).toEqual([404, 404]);
    expect(await readErrorBody(foreignRead)).toEqual({ error: { code: "NOT_FOUND", message: "Invoice not found" } });

    const row = await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: true } });
    expect(row).toMatchObject({ userId: alice.user.id, version: 0 });
    expect(row.items).toHaveLength(1);
    expect((await read(alice.cookie, invoice.id)).status).toBe(200);
  });

  it("rejects another user's product reference with 404 naming the line", async () => {
    const alice = await registerAndLogin();
    const bob = await registerAndLogin();
    const [aliceProduct] = await ownedProducts(alice.user.id, [["ALICE-2", 1299, 5]]);

    const foreignCreate = await create(bob.cookie, invoiceBody([line(aliceProduct!, 1)]));
    expect(foreignCreate.status).toBe(404);
    const error = (await readErrorBody(foreignCreate)).error;
    expect(error.code).toBe("NOT_FOUND");
    expect(error.fields?.["items.0.productId"]).toEqual(expect.any(Array));
    expect(await getPrisma().invoice.count()).toBe(0);
  });
});

describe("V1: multi-line draft creation", () => {
  it("creates an exact two-line draft with snapshots, positions and an id-derived number", async () => {
    const owner = await registerAndLogin();
    const [alpha, beta] = await ownedProducts(owner.user.id, [["DRAFT-A", 1299, 10], ["DRAFT-B", 999, 4]]);

    const response = await create(owner.cookie, invoiceBody([line(alpha!, 3), line(beta!, 2)]));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const invoice = await detailOf(response);
    expect(Object.keys(invoice).sort()).toEqual([...summaryKeys, "items"].sort());
    expect(Object.keys(invoice).sort()).not.toContain("userId");
    expect(invoice).toMatchObject({
      customerName: "Acme Distributors",
      issueDate: "2026-09-01",
      dueDate: "2026-09-30",
      notes: "Net 30",
      status: "DRAFT",
      taxRateBps: 1100,
      version: 0,
    });
    expect(invoice.invoiceNumber).toBe(`INV-${new Date().getUTCFullYear()}-${invoice.id}`);
    for (const item of invoice.items) expect(Object.keys(item).sort()).toEqual(itemKeys);
    expect(invoice.items).toEqual([
      { id: expect.any(String), productId: alpha!.id, productName: alpha!.name, unitPrice: 1299, quantity: 3, lineTotal: 3897, position: 0 },
      { id: expect.any(String), productId: beta!.id, productName: beta!.name, unitPrice: 999, quantity: 2, lineTotal: 1998, position: 1 },
    ]);
    expect([invoice.subtotal, invoice.taxAmount, invoice.total]).toEqual([5895, 648, 6543]);

    const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.userId).toBe(owner.user.id);
    expect(stored.issueDate.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(stored.dueDate.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(await getPrisma().invoiceItem.count({ where: { invoiceId: invoice.id } })).toBe(2);
  });

  it("rejects empty, duplicate, unknown, foreign, deleted and oversized item sets", async () => {
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    const [product, removable] = await ownedProducts(owner.user.id, [["REJ-1", 100, 5], ["REJ-2", 100, 5]]);
    const foreign = await createProductFixture(other.user.id, { sku: "REJ-3", unitPrice: 100, quantityOnHand: 5 });
    await softDeleteProduct(removable!.id);

    const cases: [Record<string, unknown>, number, string][] = [
      [invoiceBody([]), 422, "items"],
      [invoiceBody([line(product!, 0)]), 422, "items.0.quantity"],
      [invoiceBody([line(product!, 1.5)]), 422, "items.0.quantity"],
      [invoiceBody([line(product!, 1000001)]), 422, "items.0.quantity"],
      [invoiceBody([line(product!, 1), line(product!, 2)]), 422, "items.1.productId"],
      [invoiceBody([{ productId: "not-a-uuid", quantity: 1 }]), 422, "items.0.productId"],
      [invoiceBody(Array.from({ length: 101 }, () => ({ productId: randomUUID(), quantity: 1 }))), 422, "items"],
      [invoiceBody([{ productId: randomUUID(), quantity: 1 }]), 404, "items.0.productId"],
      [invoiceBody([line(removable!, 1)]), 404, "items.0.productId"],
      [invoiceBody([line(foreign, 1)]), 404, "items.0.productId"],
    ];
    for (const [body, status, field] of cases) {
      const response = await create(owner.cookie, body);
      expect(response.status, JSON.stringify(body).slice(0, 120)).toBe(status);
      const error = (await readErrorBody(response)).error;
      expect(error.code, JSON.stringify(body).slice(0, 120)).toBe(status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR");
      expect(error.fields?.[field], `${field} in ${JSON.stringify(body).slice(0, 120)}`).toEqual(expect.any(Array));
    }
    expect(await getPrisma().invoice.count()).toBe(0);
  });

  it("rejects malformed metadata, dates and ownership with field errors", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["META-1", 100, 5]]);
    const items = [line(product!, 1)];

    const cases: [Record<string, unknown>, string][] = [
      [{ issueDate: "2026-02-30" }, "issueDate"],
      [{ issueDate: "2026-13-01" }, "issueDate"],
      [{ issueDate: "2026-9-1" }, "issueDate"],
      [{ dueDate: "2026-08-31" }, "dueDate"],
      [{ customerName: "   " }, "customerName"],
      [{ customerName: "x".repeat(201) }, "customerName"],
      [{ notes: "y".repeat(2001) }, "notes"],
      [{ userId: randomUUID() }, "userId"],
      [{ status: "DRAFT" }, "status"],
      [{ items: undefined }, "items"],
    ];
    for (const [override, field] of cases) {
      const response = await create(owner.cookie, invoiceBody(items, override));
      expect(response.status, JSON.stringify(override)).toBe(422);
      const error = (await readErrorBody(response)).error;
      expect(error.fields?.[field], `${field} in ${JSON.stringify(override)}`).toEqual(expect.any(Array));
    }
    expect(await getPrisma().invoice.count()).toBe(0);
  });
});

describe("V2: exact integer-cent totals and rejected client arithmetic", () => {
  it("computes every total from server-side snapshots with one half-up tax step", async () => {
    const owner = await registerAndLogin();
    const [alpha, beta, nickel] = await ownedProducts(owner.user.id, [["TOT-A", 1299, 50], ["TOT-B", 999, 50], ["TOT-C", 5, 50]]);

    const multi = await detailOf(await create(owner.cookie, invoiceBody([line(alpha!, 3), line(beta!, 2)])));
    expect({ subtotal: multi.subtotal, taxAmount: multi.taxAmount, total: multi.total }).toEqual({ subtotal: 5895, taxAmount: 648, total: 6543 });

    // 5 cents x 5 = 25 cents; 11% of 25 is 2.75 -> 3 with half-up (a truncating implementation gives 2).
    const halfUp = await detailOf(await create(owner.cookie, invoiceBody([line(nickel!, 5)])));
    expect({ subtotal: halfUp.subtotal, taxAmount: halfUp.taxAmount, total: halfUp.total }).toEqual({ subtotal: 25, taxAmount: 3, total: 28 });

    const zeroTax = await withTaxRate("0", async () => detailOf(await create(owner.cookie, invoiceBody([line(alpha!, 1)]))));
    expect({ subtotal: zeroTax.subtotal, taxAmount: zeroTax.taxAmount, total: zeroTax.total }).toEqual({ subtotal: 1299, taxAmount: 0, total: 1299 });
    expect(await getPrisma().invoice.count()).toBe(3);
  });

  it("rejects client-supplied totals, snapshots, status and ownership with 422 field errors", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["SPOOF-1", 1299, 5]]);

    const spoofed: [Record<string, unknown>, string][] = [
      [{ subtotal: 1 }, "subtotal"],
      [{ taxAmount: 1 }, "taxAmount"],
      [{ total: 1 }, "total"],
      [{ taxRateBps: 0 }, "taxRateBps"],
      [{ status: "PAID" }, "status"],
      [{ version: 1 }, "version"],
      [{ invoiceNumber: "INV-2026-forged" }, "invoiceNumber"],
      [{ userId: randomUUID() }, "userId"],
    ];
    for (const [override, field] of spoofed) {
      const response = await create(owner.cookie, invoiceBody([line(product!, 1)], override));
      expect(response.status, field).toBe(422);
      const error = (await readErrorBody(response)).error;
      expect(error.code, field).toBe("VALIDATION_ERROR");
      expect(error.fields?.[field], field).toEqual(expect.any(Array));
    }

    const spoofedItems: [Record<string, unknown>, string][] = [
      [{ ...line(product!, 1), unitPrice: 1 }, "items.0.unitPrice"],
      [{ ...line(product!, 1), productName: "Invented" }, "items.0.productName"],
      [{ ...line(product!, 1), lineTotal: 1 }, "items.0.lineTotal"],
      [{ productId: product!.id }, "items.0.quantity"],
    ];
    for (const [item, field] of spoofedItems) {
      const response = await create(owner.cookie, invoiceBody([item]));
      expect(response.status, field).toBe(422);
      expect((await readErrorBody(response)).error.fields?.[field], field).toEqual(expect.any(Array));
    }
    expect(await getPrisma().invoice.count()).toBe(0);
  });

  it("rejects overflowing line, subtotal and total arithmetic with 422", async () => {
    const owner = await registerAndLogin();
    const maxed = await createProductFixture(owner.user.id, { sku: "MAX-1", unitPrice: 2147483647, quantityOnHand: 1000000 });

    const lineOverflow = await create(owner.cookie, invoiceBody([line(maxed, 2)]));
    expect(lineOverflow.status).toBe(422);
    expect((await readErrorBody(lineOverflow)).error.code).toBe("ARITHMETIC_BOUNDS");

    const taxOverflow = await create(owner.cookie, invoiceBody([line(maxed, 1)]));
    expect(taxOverflow.status).toBe(422);
    expect((await readErrorBody(taxOverflow)).error.code).toBe("ARITHMETIC_BOUNDS");

    expect(await getPrisma().invoice.count()).toBe(0);
  });
  it("rejects overflow from a retained snapshot when a draft line is edited upward", async () => {
    const owner = await registerAndLogin();
    const maxed = await createProductFixture(owner.user.id, { sku: "MAX-2", unitPrice: 2147483647, quantityOnHand: 5 });
    const draft = await createInvoiceFixture(owner.user.id, [{ product: maxed, quantity: 1 }], { taxRateBps: 0 });

    const grown = await replace(owner.cookie, draft.id, { version: draft.version, items: [line(maxed, 2)] });
    expect(grown.status).toBe(422);
    expect((await readErrorBody(grown)).error.code).toBe("ARITHMETIC_BOUNDS");

    const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
    expect(stored).toMatchObject({ version: 0, subtotal: 2147483647, taxAmount: 0, total: 2147483647 });
    expect(stored.items[0]).toMatchObject({ unitPrice: 2147483647, quantity: 1, lineTotal: 2147483647 });
  });
});

describe("V3: the configured tax rate is stored and reused", () => {
  it("stores the default 11%, honors an alternate configured rate and keeps the persisted rate", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["TAX-1", 1000, 10]]);

    const defaultValue = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 2)])));
    expect([defaultValue.taxRateBps, defaultValue.subtotal, defaultValue.taxAmount, defaultValue.total]).toEqual([1100, 2000, 220, 2220]);

    const fivePercent = await withTaxRate("500", async () => detailOf(await create(owner.cookie, invoiceBody([line(product!, 2)]))));
    expect([fivePercent.taxRateBps, fivePercent.subtotal, fivePercent.taxAmount, fivePercent.total]).toEqual([500, 2000, 100, 2100]);

    const edited = await withTaxRate("1100", async () =>
      detailOf(await replace(owner.cookie, fivePercent.id, { version: fivePercent.version, items: [line(product!, 4)] })));
    expect(edited).toMatchObject({ taxRateBps: 500, subtotal: 4000, taxAmount: 200, total: 4200, version: 1, status: "DRAFT" });
    expect(await getPrisma().invoice.count()).toBe(2);
  });

  it("answers an invalid tax configuration with a sanitized 500 and writes nothing", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["TAX-BAD", 100, 1]]);

    const response = await withTaxRate("1.5", async () => create(owner.cookie, invoiceBody([line(product!, 1)])));
    expect(response.status).toBe(500);
    expect(await readErrorBody(response)).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    expect(await getPrisma().invoice.count()).toBe(0);
  });
});

describe("V4: snapshots survive product changes and draft edits", () => {
  it("keeps invoice snapshots when the product is renamed, repriced or soft-deleted", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["SNAP-1", 1299, 9]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 2)])));

    await getPrisma().product.update({ where: { id: product!.id }, data: { name: "Renamed Widget", unitPrice: 1500, version: { increment: 1 } } });
    await softDeleteProduct(product!.id);

    const afterProductChanges = await detailOf(await read(owner.cookie, created.id));
    expect(afterProductChanges.items).toEqual([
      { id: created.items[0]!.id, productId: product!.id, productName: product!.name, unitPrice: 1299, quantity: 2, lineTotal: 2598, position: 0 },
    ]);
    expect(afterProductChanges).toMatchObject({ subtotal: 2598, taxAmount: 286, total: 2884, version: 0, status: "DRAFT" });

    // The deleted product is still readable through the preserved invoice snapshot.
    const stored = await getPrisma().invoiceItem.findMany({ where: { invoiceId: created.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ productName: product!.name, unitPrice: 1299, quantity: 2, lineTotal: 2598 });
  });

  it("retains existing line snapshots and snapshots only newly added products", async () => {
    const owner = await registerAndLogin();
    const [retained, added] = await ownedProducts(owner.user.id, [["SNAP-A", 1299, 9], ["SNAP-B", 777, 9]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(retained!, 1)])));

    await getPrisma().product.update({ where: { id: retained!.id }, data: { name: "Retained Renamed", unitPrice: 1500, version: { increment: 1 } } });

    const replaced = await detailOf(await replace(owner.cookie, created.id, { version: created.version, items: [line(retained!, 3), line(added!, 2)] }));
    expect(replaced.items).toEqual([
      { id: expect.any(String), productId: retained!.id, productName: retained!.name, unitPrice: 1299, quantity: 3, lineTotal: 3897, position: 0 },
      { id: expect.any(String), productId: added!.id, productName: added!.name, unitPrice: 777, quantity: 2, lineTotal: 1554, position: 1 },
    ]);
    expect(replaced).toMatchObject({ subtotal: 5451, taxAmount: 600, total: 6051, version: 1 });
    expect(await getPrisma().invoiceItem.count({ where: { invoiceId: created.id } })).toBe(2);
  });
});

describe("V5: stock is validated but never reserved by drafts", () => {
  it("rejects overstock creation while naming the product and leaves stock untouched", async () => {
    const owner = await registerAndLogin();
    const [scarce] = await ownedProducts(owner.user.id, [["STOCK-1", 500, 3]]);

    const tooMany = await create(owner.cookie, invoiceBody([line(scarce!, 4)]));
    expect(tooMany.status).toBe(409);
    const error = (await readErrorBody(tooMany)).error;
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).toContain(scarce!.name);
    expect(error.fields?.["items.0.quantity"]).toEqual([expect.any(String)]);

    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: scarce!.id } })).quantityOnHand).toBe(3);
    expect(await getPrisma().invoice.count()).toBe(0);
  });

  it("reserves nothing on success and rejects an edit after an intervening stock reduction", async () => {
    const owner = await registerAndLogin();
    const [reduced] = await ownedProducts(owner.user.id, [["STOCK-2", 700, 10]]);

    const draft = await detailOf(await create(owner.cookie, invoiceBody([line(reduced!, 5)])));
    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: reduced!.id } })).quantityOnHand).toBe(10);

    await getPrisma().product.update({ where: { id: reduced!.id }, data: { quantityOnHand: 2, version: { increment: 1 } } });
    const failed = await replace(owner.cookie, draft.id, { version: draft.version, items: [line(reduced!, 5)] });
    expect(failed.status).toBe(409);
    const error = (await readErrorBody(failed)).error;
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).toContain(reduced!.name);
    expect(error.fields?.["items.0.quantity"]).toEqual(expect.any(Array));

    const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
    expect(stored).toMatchObject({ version: 0, subtotal: 3500, taxAmount: 385, total: 3885 });
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]).toMatchObject({ productId: reduced!.id, unitPrice: 700, quantity: 5, lineTotal: 3500, position: 0 });
    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: reduced!.id } })).quantityOnHand).toBe(2);
  });
});

describe("V9: draft-only item editing with version guarding and atomic replacement", () => {
  it("replaces the whole item set, recomputes totals and increments the version", async () => {
    const owner = await registerAndLogin();
    const [first, second] = await ownedProducts(owner.user.id, [["EDIT-1", 1000, 9], ["EDIT-2", 250, 9]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(first!, 1)])));

    const replacedResponse = await replace(owner.cookie, created.id, { version: 0, items: [line(first!, 2), line(second!, 3)] });
    expect(replacedResponse.status).toBe(200);
    expect(replacedResponse.headers.get("cache-control")).toBe("no-store");
    const replaced = await detailOf(replacedResponse);
    expect(replaced).toMatchObject({ id: created.id, status: "DRAFT", version: 1, taxRateBps: 1100, subtotal: 2750, taxAmount: 303, total: 3053 });
    expect(replaced.items.map((item) => [item.position, item.productId, item.quantity, item.lineTotal])).toEqual([
      [0, first!.id, 2, 2000],
      [1, second!.id, 3, 750],
    ]);
    expect(replaced.items.map((item) => item.id)).not.toEqual(created.items.map((item) => item.id));
    expect(await getPrisma().invoiceItem.count({ where: { invoiceId: created.id } })).toBe(2);

    // A second replacement uses the incremented version and can shrink the set back to one line.
    const shrunk = await detailOf(await replace(owner.cookie, created.id, { version: replaced.version, items: [line(second!, 1)] }));
    expect(shrunk).toMatchObject({ version: 2, subtotal: 250, taxAmount: 28, total: 278 });
    expect(shrunk.items).toHaveLength(1);
    expect(await getPrisma().invoiceItem.count({ where: { invoiceId: created.id } })).toBe(1);
  });

  it("rejects a stale version with 409 and leaves the draft untouched", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["STALE-1", 1000, 9]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 1)])));
    expect((await replace(owner.cookie, created.id, { version: 0, items: [line(product!, 2)] })).status).toBe(200);

    const stale = await replace(owner.cookie, created.id, { version: 0, items: [line(product!, 5)] });
    expect(stale.status).toBe(409);
    expect(await readErrorBody(stale)).toEqual({ error: { code: "VERSION_CONFLICT", message: "The invoice changed; reload and retry" } });

    const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
    expect(stored).toMatchObject({ version: 1, subtotal: 2000, taxAmount: 220, total: 2220 });
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]).toMatchObject({ quantity: 2, lineTotal: 2000 });
  });

  it("refuses to edit issued, paid or cancelled invoices", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["CLOSED-1", 1000, 9]]);

    const statuses: InvoiceStatus[] = ["ISSUED", "PAID", "CANCELLED"];
    for (const status of statuses) {
      const fixture = await createInvoiceFixture(owner.user.id, [{ product: product!, quantity: 1 }], { status });
      const response = await replace(owner.cookie, fixture.id, { version: 0, items: [line(product!, 2)] });
      expect(response.status, status).toBe(409);
      expect((await readErrorBody(response)).error, status).toEqual({ code: "INVOICE_NOT_EDITABLE", message: "Only draft invoices can have their items replaced" });
      const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: fixture.id }, include: { items: true } });
      expect(stored).toMatchObject({ status, version: 0, subtotal: 1000, taxAmount: 110, total: 1110 });
      expect(stored.items[0]).toMatchObject({ quantity: 1, lineTotal: 1000 });
    }
  });
  it("rolls the entire replacement back when any line is invalid", async () => {
    const owner = await registerAndLogin();
    const [product, scarce] = await ownedProducts(owner.user.id, [["ROLL-1", 1000, 9], ["ROLL-2", 500, 2]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 1)])));

    const unknown = await replace(owner.cookie, created.id, { version: 0, items: [line(product!, 4), { productId: randomUUID(), quantity: 1 }] });
    expect(unknown.status).toBe(404);
    expect((await readErrorBody(unknown)).error.fields?.["items.1.productId"]).toEqual(expect.any(Array));

    const overstock = await replace(owner.cookie, created.id, { version: 0, items: [line(product!, 4), line(scarce!, 9)] });
    expect(overstock.status).toBe(409);
    expect((await readErrorBody(overstock)).error.fields?.["items.1.quantity"]).toEqual(expect.any(Array));

    const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
    expect(stored).toMatchObject({ version: 0, subtotal: 1000, taxAmount: 110, total: 1110 });
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]).toMatchObject({ id: created.items[0]!.id, productId: product!.id, quantity: 1, lineTotal: 1000, position: 0 });
  });

  it("serializes two concurrent same-version replacements into one success and one conflict", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["RACE-1", 1000, 9]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 1)])));

    const [left, right] = await Promise.all([
      replace(owner.cookie, created.id, { version: 0, items: [line(product!, 2)] }),
      replace(owner.cookie, created.id, { version: 0, items: [line(product!, 3)] }),
    ]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409]);

    const stored = await getPrisma().invoice.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
    expect(stored.version).toBe(1);
    expect(stored.items).toHaveLength(1);
    expect([2000, 3000]).toContain(stored.items[0]!.lineTotal);
    expect(stored.subtotal).toBe(stored.items[0]!.lineTotal);
  });
});

describe("V10: paginated summaries, status filter and complete detail", () => {
  it("lists owned summaries newest-first with totals under the same status filter", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["LIST-1", 100, 10]]);
    const base = Date.now();
    const oldest = await createInvoiceFixture(owner.user.id, [{ product: product!, quantity: 1 }], { status: "DRAFT", customerName: "Oldest", createdAt: new Date(base - 3000) });
    const middle = await createInvoiceFixture(owner.user.id, [{ product: product!, quantity: 1 }], { status: "ISSUED", customerName: "Middle", createdAt: new Date(base - 2000) });
    const newest = await createInvoiceFixture(owner.user.id, [{ product: product!, quantity: 1 }], { status: "PAID", customerName: "Newest", createdAt: new Date(base - 1000) });

    const page1 = await pageOf(await list(owner.cookie, "pageSize=2"));
    expect(page1.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page1.data.map((invoice) => invoice.id)).toEqual([newest.id, middle.id]);
    expect(Object.keys(page1.data[0]!).sort()).toEqual(summaryKeys);
    expect(page1.data[0]!.invoiceNumber).toMatch(/^INV-\d{4}-[0-9a-f-]{36}$/);

    const page2 = await pageOf(await list(owner.cookie, "page=2&pageSize=2"));
    expect(page2.data.map((invoice) => invoice.id)).toEqual([oldest.id]);
    expect(await pageOf(await list(owner.cookie, "page=3&pageSize=2"))).toEqual({ data: [], pagination: { page: 3, pageSize: 2, total: 3, totalPages: 2 } });

    const drafts = await pageOf(await list(owner.cookie, "status=DRAFT"));
    expect(drafts.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(drafts.data[0]).toMatchObject({ id: oldest.id, status: "DRAFT", customerName: "Oldest", issueDate: "2026-09-01", dueDate: "2026-09-30" });
    const issued = await pageOf(await list(owner.cookie, "status=ISSUED"));
    expect(issued.data.map((invoice) => invoice.id)).toEqual([middle.id]);
  });

  it("returns complete ordered detail and rejects malformed, unknown or foreign ids", async () => {
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    const [first, second] = await ownedProducts(owner.user.id, [["DET-1", 111, 5], ["DET-2", 222, 5]]);
    const created = await detailOf(await create(owner.cookie, invoiceBody([line(first!, 1), line(second!, 2)])));

    const detailResponse = await read(owner.cookie, created.id);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers.get("cache-control")).toBe("no-store");
    const full = await detailOf(detailResponse);
    expect(Object.keys(full).sort()).toEqual([...summaryKeys, "items"].sort());
    expect(full.items.map((item) => [item.position, item.productId, item.lineTotal])).toEqual([[0, first!.id, 111], [1, second!.id, 444]]);
    expect([full.subtotal, full.taxAmount, full.total]).toEqual([555, 61, 616]);

    expect((await read(owner.cookie, randomUUID())).status).toBe(404);
    expect((await read(other.cookie, created.id)).status).toBe(404);
    const malformed = await read(owner.cookie, "not-a-uuid");
    expect(malformed.status).toBe(422);
    const error = (await readErrorBody(malformed)).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.id).toEqual(expect.any(Array));
  });

  it("rejects invalid pagination, an unknown status and unknown query keys with 422", async () => {
    const owner = await registerAndLogin();
    const cases: [string, string][] = [
      ["page=0", "page"],
      ["pageSize=0", "pageSize"],
      ["pageSize=101", "pageSize"],
      ["page=9007199254740991&pageSize=100", "page"],
      ["status=BOGUS", "status"],
      ["sort=createdAt", "sort"],
    ];
    for (const [query, field] of cases) {
      const response = await list(owner.cookie, query);
      expect(response.status, query).toBe(422);
      expect((await readErrorBody(response)).error.fields?.[field], query).toEqual(expect.any(Array));
    }
  });

  it("numbers invoices from the generated id instead of a sequence", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["NUM-1", 100, 10]]);
    const first = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 1)])));
    const second = await detailOf(await create(owner.cookie, invoiceBody([line(product!, 1)])));

    const year = new Date().getUTCFullYear();
    expect(first.invoiceNumber).toBe(`INV-${year}-${first.id}`);
    expect(second.invoiceNumber).toBe(`INV-${year}-${second.id}`);
    expect(first.invoiceNumber).not.toBe(second.invoiceNumber);
  });
});

describe("N6: consistent error contract for the invoice draft API", () => {
  it("returns 400 for a non-JSON content type and for malformed JSON", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ERR-1", 100, 1]]);

    const wrongType = await createInvoiceRoute(makeRequest("/api/invoices", {
      method: "POST",
      body: "customerName=Acme",
      headers: { cookie: owner.cookie, "content-type": "text/plain" },
    }));
    expect(wrongType.status).toBe(400);
    expect(await readErrorBody(wrongType)).toEqual({ error: { code: "INVALID_JSON", message: "Expected an application/json body" } });

    const malformed = await create(owner.cookie, "{not json");
    expect(malformed.status).toBe(400);
    expect((await readErrorBody(malformed)).error.code).toBe("INVALID_JSON");

    const invoice = await createInvoiceFixture(owner.user.id, [{ product: product!, quantity: 1 }]);
    const partial = await replace(owner.cookie, invoice.id, {});
    expect(partial.status).toBe(422);
    const error = (await readErrorBody(partial)).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.version).toEqual(expect.any(Array));
    expect(error.fields?.items).toEqual(expect.any(Array));

    expect(await getPrisma().invoice.count()).toBe(1);
    expect(await getPrisma().invoiceItem.count()).toBe(1);
  });
});

