import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchStatusRoute } from "@/app/api/invoices/[id]/status/route";
import { PUT as replaceItemsRoute } from "@/app/api/invoices/[id]/items/route";
import { POST as createInvoiceRoute } from "@/app/api/invoices/route";
import { PATCH as patchProductRoute, DELETE as deleteProductRoute } from "@/app/api/products/[id]/route";
import { getPrisma } from "@/lib/prisma";
import type { InvoiceDetailDto, InvoiceStatus, ProductDto } from "@/lib/types";
import { createProductFixture, makeRequest, readErrorBody, registerAndLogin } from "../helpers";

afterAll(async () => { await getPrisma().$disconnect(); });

/**
 * Draft creation reads the configured tax rate, so the file pins the documented 11% baseline itself
 * instead of inheriting whatever a local `.env` (or a missing one) defines. Lifecycle transitions
 * never recompute totals; they reuse the rate stored on the invoice.
 */
beforeAll(() => { process.env.TAX_RATE_BPS = "1100"; });

/** The migration CHECK `quantityOnHand BETWEEN 0 AND 1000000` and the products schema share this bound. */
const MAX_STOCK = 1000000;

/** The exact trusted origin the test runner exports as BETTER_AUTH_URL. */
const TRUSTED_ORIGIN = "http://localhost:3100";

/** Route-handler contexts for the dynamic invoice/product segments. */
const detail = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonInit = (method: string, body: unknown, cookie?: string, headers: Record<string, string> = {}): RequestInit => {
  const merged = new Headers(headers);
  if (cookie) merged.set("cookie", cookie);
  return { method, body: typeof body === "string" ? body : JSON.stringify(body), headers: merged };
};

const create = (cookie: string, body: unknown): Promise<Response> =>
  createInvoiceRoute(makeRequest("/api/invoices", jsonInit("POST", body, cookie)));

const transition = (cookie: string, id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  patchStatusRoute(makeRequest(`/api/invoices/${id}/status`, jsonInit("PATCH", body, cookie, headers)), detail(id));

const patchProduct = (cookie: string, id: string, body: unknown): Promise<Response> =>
  patchProductRoute(makeRequest(`/api/products/${id}`, jsonInit("PATCH", body, cookie)), detail(id));

const replace = (cookie: string, id: string, body: unknown): Promise<Response> =>
  replaceItemsRoute(makeRequest(`/api/invoices/${id}/items`, jsonInit("PUT", body, cookie)), detail(id));

const removeProduct = (cookie: string, id: string, version: number): Promise<Response> =>
  deleteProductRoute(makeRequest(`/api/products/${id}`, jsonInit("DELETE", { version }, cookie)), detail(id));

const detailOf = async (response: Response): Promise<InvoiceDetailDto> => ((await response.json()) as { data: InvoiceDetailDto }).data;
const errorOf = async (response: Response): Promise<{ code: string; message: string; fields?: Record<string, string[]> }> =>
  (await readErrorBody(response)).error;

const line = (product: ProductDto, quantity: number) => ({ productId: product.id, quantity });

const invoiceBody = (items: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  customerName: "Acme Distributors",
  issueDate: "2026-09-01",
  dueDate: "2026-09-30",
  notes: null,
  items,
  ...overrides,
});

/** DRAFT through the shipped POST route, so transitions act on genuine snapshots and totals. */
async function draft(cookie: string, lines: { product: ProductDto; quantity: number }[]): Promise<InvoiceDetailDto> {
  const response = await create(cookie, invoiceBody(lines.map(({ product, quantity }) => line(product, quantity))));
  if (response.status !== 201) throw new Error(`Draft fixture failed with ${response.status}: ${await response.text()}`);
  return detailOf(response);
}

const issue = (cookie: string, invoice: InvoiceDetailDto): Promise<Response> =>
  transition(cookie, invoice.id, { version: invoice.version, status: "ISSUED" });
const pay = (cookie: string, invoice: InvoiceDetailDto): Promise<Response> =>
  transition(cookie, invoice.id, { version: invoice.version, status: "PAID" });
const cancel = (cookie: string, invoice: InvoiceDetailDto): Promise<Response> =>
  transition(cookie, invoice.id, { version: invoice.version, status: "CANCELLED" });

/**
 * Reaches a starting state through real transitions only (a CANCELLED invoice is always an issued one
 * that was cancelled), so every matrix row exercises shipped code.
 */
async function invoiceAt(cookie: string, product: ProductDto, status: InvoiceStatus, quantity = 3): Promise<InvoiceDetailDto> {
  const created = await draft(cookie, [{ product, quantity }]);
  if (status === "DRAFT") return created;
  const issued = await detailOf(await issue(cookie, created));
  if (status === "ISSUED") return issued;
  if (status === "PAID") return detailOf(await pay(cookie, issued));
  return detailOf(await cancel(cookie, issued));
}

/** Live stock and version of a product row: the only trustworthy evidence of a stock effect. */
async function productState(id: string) {
  const row = await getPrisma().product.findUniqueOrThrow({ where: { id } });
  return { quantityOnHand: row.quantityOnHand, version: row.version, deletedAt: row.deletedAt };
}

async function invoiceState(id: string) {
  return getPrisma().invoice.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
}

/** Owned products with deterministic prices/stock so stock effects can be asserted exactly. */
async function ownedProducts(userId: string, specs: [string, number, number][]): Promise<ProductDto[]> {
  const products: ProductDto[] = [];
  for (const [sku, unitPrice, quantityOnHand] of specs) {
    products.push(await createProductFixture(userId, { sku, name: `Widget ${sku}`, unitPrice, quantityOnHand }));
  }
  return products;
}

/** Exact public key sets: a leaked userId or deletedAt must fail these assertions. */
const summaryKeys = ["createdAt", "customerName", "dueDate", "id", "invoiceNumber", "issueDate", "notes", "status", "subtotal", "taxAmount", "taxRateBps", "total", "updatedAt", "version"];
const itemKeys = ["id", "lineTotal", "position", "productId", "productName", "quantity", "unitPrice"];

/**
 * T06 ruling 5 plus the coordinator ruling of 2026-09-18 on T07: an illegal or repeated transition
 * keeps the item-edit conflict code (409 `INVOICE_NOT_EDITABLE`) with a transition-specific message.
 */
const transitionConflict = (from: InvoiceStatus, to: InvoiceStatus) => ({
  code: "INVOICE_NOT_EDITABLE",
  message: `Invoice status cannot change from ${from} to ${to}`,
});

/**
 * The 409 codes a losing racer can observe: a stale version, a retried attempt that now sees the new
 * state (the item-edit path checks state before version), or retry exhaustion.
 */
const LOSER_CONFLICT_CODES = ["VERSION_CONFLICT", "INVOICE_NOT_EDITABLE", "TRANSACTION_CONFLICT"] as const;

/** The four legal transitions and the eight illegal ones of the 4x3 matrix. */
const LEGAL: [InvoiceStatus, InvoiceStatus][] = [
  ["DRAFT", "ISSUED"],
  ["DRAFT", "CANCELLED"],
  ["ISSUED", "PAID"],
  ["ISSUED", "CANCELLED"],
];
const ILLEGAL: [InvoiceStatus, InvoiceStatus][] = [
  ["DRAFT", "PAID"],
  ["ISSUED", "ISSUED"],
  ["PAID", "ISSUED"],
  ["PAID", "PAID"],
  ["PAID", "CANCELLED"],
  ["CANCELLED", "ISSUED"],
  ["CANCELLED", "PAID"],
  ["CANCELLED", "CANCELLED"],
];

describe("V8: transition matrix, terminal states and repeats", () => {
  it("applies each legal transition exactly once and returns the detail DTO", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["MX-OK", 1000, 500]]);

    for (const [from, to] of LEGAL) {
      const start = await invoiceAt(owner.cookie, product!, from, 2);
      expect(start.status, `${from} fixture`).toBe(from);

      const response = await transition(owner.cookie, start.id, { version: start.version, status: to });
      expect(response.status, `${from} -> ${to}`).toBe(200);
      expect(response.headers.get("cache-control"), `${from} -> ${to}`).toBe("no-store");

      const body = (await response.json()) as { data: InvoiceDetailDto };
      expect(Object.keys(body.data).sort(), `${from} -> ${to}`).toEqual([...summaryKeys, "items"].sort());
      expect(Object.keys(body.data), `${from} -> ${to}`).not.toContain("userId");
      expect(body.data, `${from} -> ${to}`).toMatchObject({ id: start.id, status: to, version: start.version + 1 });
      for (const item of body.data.items) expect(Object.keys(item).sort()).toEqual(itemKeys);
    }
  });

  it("rejects every illegal transition with 409 and leaves status, version and stock untouched", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["MX-BAD", 1000, 500]]);

    for (const [from, to] of ILLEGAL) {
      const start = await invoiceAt(owner.cookie, product!, from, 2);
      const stockBefore = await productState(product!.id);

      const response = await transition(owner.cookie, start.id, { version: start.version, status: to });
      expect(response.status, `${from} -> ${to}`).toBe(409);
      expect(await errorOf(response), `${from} -> ${to}`).toEqual(transitionConflict(from, to));

      const after = await invoiceState(start.id);
      expect(after.status, `${from} -> ${to}`).toBe(from);
      expect(after.version, `${from} -> ${to}`).toBe(start.version);
      expect(await productState(product!.id), `${from} -> ${to}`).toEqual(stockBefore);
    }
  });

  it("rejects a target outside the transition enum with 422", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["MX-422", 1000, 5]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 1 }]);

    for (const status of ["DRAFT", "BOGUS", "", 1]) {
      const response = await transition(owner.cookie, created.id, { version: created.version, status });
      expect(response.status, JSON.stringify(status)).toBe(422);
      const error = await errorOf(response);
      expect(error.code, JSON.stringify(status)).toBe("VALIDATION_ERROR");
      expect(error.fields?.status, JSON.stringify(status)).toEqual(expect.any(Array));
    }
    expect((await invoiceState(created.id)).status).toBe("DRAFT");
    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 5, version: 0 });
  });
});

describe("V6: issue deducts every line exactly once and rolls back atomically", () => {
  it("deducts all lines, bumps both versions and leaves snapshots and totals alone", async () => {
    const owner = await registerAndLogin();
    const [alpha, beta] = await ownedProducts(owner.user.id, [["ISS-1", 1299, 10], ["ISS-2", 999, 4]]);
    const created = await draft(owner.cookie, [{ product: alpha!, quantity: 3 }, { product: beta!, quantity: 4 }]);
    expect(await productState(alpha!.id)).toMatchObject({ quantityOnHand: 10, version: 0 });
    expect(await productState(beta!.id)).toMatchObject({ quantityOnHand: 4, version: 0 });

    const issued = await detailOf(await issue(owner.cookie, created));
    expect(issued).toMatchObject({
      status: "ISSUED",
      version: 1,
      subtotal: created.subtotal,
      taxAmount: created.taxAmount,
      total: created.total,
    });
    expect(issued.items).toEqual(created.items);
    expect(await productState(alpha!.id)).toEqual({ quantityOnHand: 7, version: 1, deletedAt: null });
    expect(await productState(beta!.id)).toEqual({ quantityOnHand: 0, version: 1, deletedAt: null });
  });

  it("issues exactly once: a repeated issue is 409 and deducts nothing again", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ISS-REP", 1000, 10]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 4 }]);
    const issued = await detailOf(await issue(owner.cookie, created));
    const stockAfterIssue = await productState(product!.id);
    expect(stockAfterIssue).toMatchObject({ quantityOnHand: 6, version: 1 });

    const repeated = await transition(owner.cookie, issued.id, { version: issued.version, status: "ISSUED" });
    expect(repeated.status).toBe(409);
    expect(await errorOf(repeated)).toEqual(transitionConflict("ISSUED", "ISSUED"));
    expect(await productState(product!.id)).toEqual(stockAfterIssue);
    expect(await invoiceState(issued.id)).toMatchObject({ status: "ISSUED", version: 1 });
  });

  it("rolls back the status and every deduction when a later line fails at issue", async () => {
    const owner = await registerAndLogin();
    const [solid, scarce] = await ownedProducts(owner.user.id, [["ROLL-A", 1000, 10], ["ROLL-B", 500, 4]]);
    const created = await draft(owner.cookie, [{ product: solid!, quantity: 2 }, { product: scarce!, quantity: 4 }]);

    // The second product is consumed after the draft exists, so it can no longer be satisfied.
    expect((await patchProduct(owner.cookie, scarce!.id, { version: 0, quantityOnHand: 1 })).status).toBe(200);

    const response = await issue(owner.cookie, created);
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).toContain(scarce!.name);
    expect(error.fields?.["items.1.quantity"]).toEqual(expect.any(Array));

    // The first line's deduction was rolled back with the status claim.
    expect(await productState(solid!.id)).toMatchObject({ quantityOnHand: 10, version: 0 });
    expect(await productState(scarce!.id)).toMatchObject({ quantityOnHand: 1, version: 1 });
    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });
  });

  it("refuses to issue a draft containing a soft-deleted product and names the line", async () => {
    const owner = await registerAndLogin();
    const [kept, removed] = await ownedProducts(owner.user.id, [["DEL-A", 1000, 10], ["DEL-B", 500, 4]]);
    const created = await draft(owner.cookie, [{ product: kept!, quantity: 1 }, { product: removed!, quantity: 2 }]);
    expect((await removeProduct(owner.cookie, removed!.id, 0)).status).toBe(204);

    const response = await issue(owner.cookie, created);
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.fields?.["items.1.productId"]).toEqual(expect.any(Array));

    expect(await productState(kept!.id)).toMatchObject({ quantityOnHand: 10, version: 0 });
    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });
  });
});

describe("V5: issue rechecks the live stock of every line", () => {
  it("rejects an issue after an intervening stock reduction and reports the current stock", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["LIVE-1", 1000, 8]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 5 }]);
    expect((await patchProduct(owner.cookie, product!.id, { version: 0, quantityOnHand: 3 })).status).toBe(200);

    const response = await issue(owner.cookie, created);
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).toBe(`Only 3 of ${product!.name} are in stock`);
    expect(error.fields?.["items.0.quantity"]).toEqual(expect.any(Array));

    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 3, version: 1 });
    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });

    // The draft is still editable, so the user can shrink the line and issue it afterwards.
    const trimmed = await transition(owner.cookie, created.id, { version: 0, status: "ISSUED" });
    expect(trimmed.status).toBe(409);
    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 3, version: 1 });
  });
});

describe("V7: cancellation restores issued stock exactly once", () => {
  it("restores nothing for a draft cancellation and every line once for an issued one", async () => {
    const owner = await registerAndLogin();
    const [draftProduct, alpha, beta] = await ownedProducts(owner.user.id, [["CAN-D", 1000, 9], ["CAN-A", 1000, 10], ["CAN-B", 500, 10]]);

    const draftInvoice = await draft(owner.cookie, [{ product: draftProduct!, quantity: 3 }]);
    const cancelledDraft = await detailOf(await cancel(owner.cookie, draftInvoice));
    expect(cancelledDraft).toMatchObject({ status: "CANCELLED", version: 1 });
    expect(await productState(draftProduct!.id)).toEqual({ quantityOnHand: 9, version: 0, deletedAt: null });

    const issued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [
      { product: alpha!, quantity: 4 },
      { product: beta!, quantity: 6 },
    ])));
    expect(await productState(alpha!.id)).toEqual({ quantityOnHand: 6, version: 1, deletedAt: null });
    expect(await productState(beta!.id)).toEqual({ quantityOnHand: 4, version: 1, deletedAt: null });

    const cancelled = await detailOf(await cancel(owner.cookie, issued));
    expect(cancelled).toMatchObject({ status: "CANCELLED", version: issued.version + 1 });
    expect(await productState(alpha!.id)).toEqual({ quantityOnHand: 10, version: 2, deletedAt: null });
    expect(await productState(beta!.id)).toEqual({ quantityOnHand: 10, version: 2, deletedAt: null });
  });

  it("repeats a cancellation with 409 and never restores the same stock twice", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["CAN-REP", 1000, 10]]);
    const issued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [{ product: product!, quantity: 3 }])));
    const cancelled = await detailOf(await cancel(owner.cookie, issued));
    const restored = await productState(product!.id);
    expect(restored).toEqual({ quantityOnHand: 10, version: 2, deletedAt: null });

    const staleRepeat = await transition(owner.cookie, cancelled.id, { version: issued.version, status: "CANCELLED" });
    expect(staleRepeat.status).toBe(409);
    expect(await errorOf(staleRepeat)).toEqual(transitionConflict("CANCELLED", "CANCELLED"));

    const currentRepeat = await transition(owner.cookie, cancelled.id, { version: cancelled.version, status: "CANCELLED" });
    expect(currentRepeat.status).toBe(409);
    expect(await errorOf(currentRepeat)).toEqual(transitionConflict("CANCELLED", "CANCELLED"));

    expect(await productState(product!.id)).toEqual(restored);
    expect(await invoiceState(cancelled.id)).toMatchObject({ status: "CANCELLED", version: 2 });
  });

  it("restores the stock of a soft-deleted product line", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["CAN-DEL", 1000, 6]]);
    const issued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [{ product: product!, quantity: 4 }])));
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 2, version: 1, deletedAt: null });
    expect((await removeProduct(owner.cookie, product!.id, 1)).status).toBe(204);

    const cancelled = await detailOf(await cancel(owner.cookie, issued));
    expect(cancelled).toMatchObject({ status: "CANCELLED", version: 2 });
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 6, version: 3, deletedAt: expect.any(Date) });
  });

  it("rolls back a cancellation that would push stock past the database bound", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["OVER-1", 1000, 10]]);
    const issued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [{ product: product!, quantity: 5 }])));
    // A manual write raises the stock to the maximum while the invoice is out, so restoring 5 overflows.
    expect((await patchProduct(owner.cookie, product!.id, { version: 1, quantityOnHand: MAX_STOCK })).status).toBe(200);

    const response = await cancel(owner.cookie, issued);
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("STOCK_OVERFLOW");
    expect(error.message).toContain(product!.name);
    expect(error.fields).toBeUndefined();

    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: MAX_STOCK, version: 2 });
    expect(await invoiceState(issued.id)).toMatchObject({ status: "ISSUED", version: 1 });
  });
});

describe("V9/I4: drafts reserve nothing and every stock change bumps versions", () => {
  it("leaves stock untouched while drafting and increments the product version on issue and cancellation", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["VER-1", 1000, 10]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 3 }]);
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 10, version: 0, deletedAt: null });

    const issued = await detailOf(await issue(owner.cookie, created));
    expect(issued.version).toBe(1);
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 7, version: 1, deletedAt: null });

    const cancelled = await detailOf(await cancel(owner.cookie, issued));
    expect(cancelled.version).toBe(2);
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 10, version: 2, deletedAt: null });
  });

  it("rejects a stale manual product write so it cannot overwrite a deducted quantity", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["STALE-1", 1000, 10]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 4 }]);
    await issue(owner.cookie, created);
    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 6, version: 1 });

    const stale = await patchProduct(owner.cookie, product!.id, { version: 0, quantityOnHand: 10 });
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).code).toBe("VERSION_CONFLICT");
    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 6, version: 1 });
  });

  it("freezes the item set after a transition, for issued, paid and cancelled invoices", async () => {
    const owner = await registerAndLogin();
    const [product, other] = await ownedProducts(owner.user.id, [["FREEZE-1", 1000, 10], ["FREEZE-2", 500, 10]]);

    // Issued then paid: both non-draft states reject a line replacement with T06's item-edit contract.
    const issued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [{ product: product!, quantity: 2 }])));
    const issuedEdit = await replace(owner.cookie, issued.id, { version: issued.version, items: [line(other!, 1)] });
    expect(issuedEdit.status).toBe(409);
    expect(await errorOf(issuedEdit)).toEqual({ code: "INVOICE_NOT_EDITABLE", message: "Only draft invoices can have their items replaced" });

    const paid = await detailOf(await pay(owner.cookie, issued));
    const paidEdit = await replace(owner.cookie, paid.id, { version: paid.version, items: [line(other!, 1)] });
    expect(paidEdit.status).toBe(409);
    expect((await errorOf(paidEdit)).code).toBe("INVOICE_NOT_EDITABLE");

    // Cancelled (the other terminal state) is frozen too.
    const secondIssued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [{ product: product!, quantity: 1 }])));
    const cancelled = await detailOf(await cancel(owner.cookie, secondIssued));
    const cancelledEdit = await replace(owner.cookie, cancelled.id, { version: cancelled.version, items: [line(other!, 1)] });
    expect(cancelledEdit.status).toBe(409);
    expect((await errorOf(cancelledEdit)).code).toBe("INVOICE_NOT_EDITABLE");

    // No rejected edit changed an item row, and the untouched product never moved.
    const frozen = await invoiceState(issued.id);
    expect(frozen).toMatchObject({ status: "PAID", version: 2 });
    expect(frozen.items).toHaveLength(1);
    expect(frozen.items[0]).toMatchObject({ productId: product!.id, quantity: 2 });
    const frozenCancelled = await invoiceState(cancelled.id);
    expect(frozenCancelled).toMatchObject({ status: "CANCELLED", version: 2 });
    expect(frozenCancelled.items).toHaveLength(1);
    expect(frozenCancelled.items[0]).toMatchObject({ productId: product!.id, quantity: 1 });
    expect(await productState(other!.id)).toEqual({ quantityOnHand: 10, version: 0, deletedAt: null });
  });
});

describe("A6/A7: the status endpoint authenticates owners only", () => {
  it("returns 401 for every status request without a session, even malformed input", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ANON-1", 100, 1]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 1 }]);

    const cases: [string, unknown, Record<string, string>][] = [
      [created.id, { version: 0, status: "ISSUED" }, {}],
      [created.id, {}, {}],
      ["not-a-uuid", { version: 0, status: "ISSUED" }, {}],
      [created.id, "{not json", {}],
      [created.id, { version: 0, status: "ISSUED" }, { "content-type": "text/plain" }],
    ];
    for (const [id, body, headers] of cases) {
      const response = await transition("", id, body, headers);
      const label = `${id} ${JSON.stringify(body)}`;
      expect(response.status, label).toBe(401);
      expect(response.headers.get("cache-control"), label).toBe("no-store");
      expect(await readErrorBody(response), label).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });
  });

  it("treats a foreign invoice as 404 and never touches its stock", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["FOREIGN-1", 1000, 5]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 2 }]);
    const other = await registerAndLogin();

    const response = await transition(other.cookie, created.id, { version: created.version, status: "ISSUED" });
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({ code: "NOT_FOUND", message: "Invoice not found" });
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 5, version: 0, deletedAt: null });
    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });

    // Ownership is the only reason it failed: the real owner can still issue it.
    expect((await issue(owner.cookie, created)).status).toBe(200);
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 3, version: 1, deletedAt: null });
  });
});

describe("N6: consistent error contract for the status endpoint", () => {
  it("rejects a missing or foreign Origin on an authenticated transition with 403", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ORIG-ST", 1000, 5]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 1 }]);

    const foreign = await transition(owner.cookie, created.id, { version: 0, status: "ISSUED" }, { origin: "http://evil.example" });
    expect(foreign.status).toBe(403);
    expect(await errorOf(foreign)).toEqual({ code: "ORIGIN_REJECTED", message: "Request origin is not allowed" });

    // A raw request without any Origin header, so makeRequest's default cannot mask the case.
    const withoutOrigin = new Request(new URL(`/api/invoices/${created.id}/status`, TRUSTED_ORIGIN), {
      method: "PATCH",
      headers: { cookie: owner.cookie, "content-type": "application/json" },
      body: JSON.stringify({ version: 0, status: "ISSUED" }),
    });
    expect((await patchStatusRoute(withoutOrigin, detail(created.id))).status).toBe(403);

    expect(await productState(product!.id)).toEqual({ quantityOnHand: 5, version: 0, deletedAt: null });
    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });
  });

  it("returns 400 for a non-JSON content type and for malformed JSON", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ERR-ST", 1000, 1]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 1 }]);

    const wrongType = await transition(owner.cookie, created.id, "status=ISSUED", { "content-type": "text/plain" });
    expect(wrongType.status).toBe(400);
    expect(await readErrorBody(wrongType)).toEqual({ error: { code: "INVALID_JSON", message: "Expected an application/json body" } });

    const malformed = await transition(owner.cookie, created.id, "{not json");
    expect(malformed.status).toBe(400);
    expect((await errorOf(malformed)).code).toBe("INVALID_JSON");

    expect(await invoiceState(created.id)).toMatchObject({ status: "DRAFT", version: 0 });
    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 1, version: 0 });
  });

  it("returns 422 for a malformed id or a malformed transition body", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["ERR-422", 1000, 5]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 1 }]);

    const malformedId = await transition(owner.cookie, "not-a-uuid", { version: 0, status: "ISSUED" });
    expect(malformedId.status).toBe(422);
    const idError = await errorOf(malformedId);
    expect(idError.code).toBe("VALIDATION_ERROR");
    expect(idError.fields?.id).toEqual(expect.any(Array));

    const bodies: [unknown, string[]][] = [
      [{ status: "ISSUED" }, ["version"]],
      [{ version: 0 }, ["status"]],
      [{ version: -1, status: "ISSUED" }, ["version"]],
      [{ version: 0, status: "ISSUED", userId: randomUUID() }, ["userId"]],
      [{}, ["version", "status"]],
    ];
    for (const [body, fields] of bodies) {
      const response = await transition(owner.cookie, created.id, body);
      const label = JSON.stringify(body);
      expect(response.status, label).toBe(422);
      const error = await errorOf(response);
      expect(error.code, label).toBe("VALIDATION_ERROR");
      for (const field of fields) expect(error.fields?.[field], `${field} in ${label}`).toEqual(expect.any(Array));
    }
    expect(await productState(product!.id)).toMatchObject({ quantityOnHand: 5, version: 0 });
  });

  it("returns 404 for a well-formed unknown invoice id", async () => {
    const owner = await registerAndLogin();
    const response = await transition(owner.cookie, randomUUID(), { version: 0, status: "ISSUED" });
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({ code: "NOT_FOUND", message: "Invoice not found" });
  });
});

describe("concurrency: the lifecycle races on real PostgreSQL", () => {
  it("issues one invoice exactly once under two concurrent identical requests", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["RACE-ISS", 1000, 10]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 4 }]);

    const [left, right] = await Promise.all([
      transition(owner.cookie, created.id, { version: created.version, status: "ISSUED" }),
      transition(owner.cookie, created.id, { version: created.version, status: "ISSUED" }),
    ]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409]);

    expect(await invoiceState(created.id)).toMatchObject({ status: "ISSUED", version: 1 });
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 6, version: 1, deletedAt: null });
  });

  it("cannot oversell when two drafts race for the last stock", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["RACE-OVER", 1000, 5]]);
    const first = await draft(owner.cookie, [{ product: product!, quantity: 5 }]);
    const second = await draft(owner.cookie, [{ product: product!, quantity: 5 }]);

    const [left, right] = await Promise.all([issue(owner.cookie, first), issue(owner.cookie, second)]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409]);
    // The loser's stock is genuinely gone, so its rejection is the stock conflict (not merely a retry).
    const loser = left.status === 409 ? left : right;
    expect(await errorOf(loser)).toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await productState(product!.id)).toEqual({ quantityOnHand: 0, version: 1, deletedAt: null });
    expect(await getPrisma().invoice.count({ where: { status: "ISSUED" } })).toBe(1);
    expect(await getPrisma().invoice.count({ where: { status: "DRAFT" } })).toBe(1);
  });

  it("restores issued stock exactly once under two concurrent cancellations", async () => {
    const owner = await registerAndLogin();
    const [product] = await ownedProducts(owner.user.id, [["RACE-CAN", 1000, 10]]);
    const issued = await detailOf(await issue(owner.cookie, await draft(owner.cookie, [{ product: product!, quantity: 3 }])));
    expect(await productState(product!.id)).toEqual({ quantityOnHand: 7, version: 1, deletedAt: null });

    const [left, right] = await Promise.all([cancel(owner.cookie, issued), cancel(owner.cookie, issued)]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409]);
    // The loser can observe the winner's version bump or its new status, so only the 409 class is pinned.
    const loser = left.status === 409 ? left : right;
    expect(LOSER_CONFLICT_CODES).toContain((await errorOf(loser)).code);

    expect(await productState(product!.id)).toEqual({ quantityOnHand: 10, version: 2, deletedAt: null });
    expect(await invoiceState(issued.id)).toMatchObject({ status: "CANCELLED", version: 2 });
  });

  it("serializes a draft edit racing an issue into one winner and a coherent outcome", async () => {
    const owner = await registerAndLogin();
    const [product, replacement] = await ownedProducts(owner.user.id, [["RACE-EDIT", 1000, 10], ["RACE-NEW", 500, 10]]);
    const created = await draft(owner.cookie, [{ product: product!, quantity: 4 }]);

    const [edit, issued] = await Promise.all([
      replace(owner.cookie, created.id, { version: created.version, items: [line(replacement!, 2)] }),
      transition(owner.cookie, created.id, { version: created.version, status: "ISSUED" }),
    ]);
    expect([edit.status, issued.status].sort((a, b) => a - b)).toEqual([200, 409]);

    const stored = await invoiceState(created.id);
    if (issued.status === 200) {
      // Issue claimed the version first: the edit is rejected and only the original line left stock.
      expect(stored).toMatchObject({ status: "ISSUED", version: 1 });
      expect(stored.items).toHaveLength(1);
      expect(stored.items[0]).toMatchObject({ productId: product!.id, quantity: 4 });
      expect(LOSER_CONFLICT_CODES).toContain((await errorOf(edit)).code);
      expect(await productState(product!.id)).toEqual({ quantityOnHand: 6, version: 1, deletedAt: null });
      expect(await productState(replacement!.id)).toEqual({ quantityOnHand: 10, version: 0, deletedAt: null });
    } else {
      // The edit won: the invoice is still a draft with the replaced line and no stock effect at all.
      expect(stored).toMatchObject({ status: "DRAFT", version: 1 });
      expect(stored.items).toHaveLength(1);
      expect(stored.items[0]).toMatchObject({ productId: replacement!.id, quantity: 2 });
      expect(["VERSION_CONFLICT", "TRANSACTION_CONFLICT"]).toContain((await errorOf(issued)).code);
      expect(await productState(product!.id)).toEqual({ quantityOnHand: 10, version: 0, deletedAt: null });
      expect(await productState(replacement!.id)).toEqual({ quantityOnHand: 10, version: 0, deletedAt: null });
    }
  });
});
