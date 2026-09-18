import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DELETE as deleteProductRoute, GET as getProductRoute, PATCH as updateProductRoute } from "@/app/api/products/[id]/route";
import { GET as listProductsRoute, POST as createProductRoute } from "@/app/api/products/route";
import { getPrisma } from "@/lib/prisma";
import type { Page, ProductDto } from "@/lib/types";
import { createProductFixture, makeRequest, readErrorBody, registerAndLogin, withCookie } from "../helpers";

afterAll(async () => { await getPrisma().$disconnect(); });

/** The exact trusted origin the test runner exports as BETTER_AUTH_URL. */
const TRUSTED_ORIGIN = "http://localhost:3100";

/** Route-handler context for the dynamic product segment. */
const detail = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonInit = (method: string, body: unknown, cookie?: string, headers: Record<string, string> = {}): RequestInit => {
  const merged = new Headers(headers);
  if (cookie) merged.set("cookie", cookie);
  return { method, body: typeof body === "string" ? body : JSON.stringify(body), headers: merged };
};

const list = (cookie: string, query = ""): Promise<Response> =>
  listProductsRoute(makeRequest(`/api/products${query ? `?${query}` : ""}`, withCookie(cookie)));

const create = (cookie: string, body: unknown): Promise<Response> =>
  createProductRoute(makeRequest("/api/products", jsonInit("POST", body, cookie)));

const patch = (cookie: string, id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  updateProductRoute(makeRequest(`/api/products/${id}`, jsonInit("PATCH", body, cookie, headers)), detail(id));

const remove = (cookie: string, id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  deleteProductRoute(makeRequest(`/api/products/${id}`, jsonInit("DELETE", body, cookie, headers)), detail(id));

const read = (cookie: string, id: string): Promise<Response> =>
  getProductRoute(makeRequest(`/api/products/${id}`, withCookie(cookie)), detail(id));

const productBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  sku: `SKU-${randomUUID().slice(0, 8).toUpperCase()}`,
  name: "Test Widget",
  unitPrice: 1299,
  quantityOnHand: 10,
  ...overrides,
});

const pageOf = async (response: Response): Promise<Page<ProductDto>> => (await response.json()) as Page<ProductDto>;
const dataOf = async (response: Response): Promise<ProductDto> => ((await response.json()) as { data: ProductDto }).data;
const idsOf = (result: Page<ProductDto>): string[] => result.data.map((product) => product.id);
const search = async (cookie: string, term: string): Promise<string[]> =>
  idsOf(await pageOf(await list(cookie, `search=${encodeURIComponent(term)}`)));

describe("A6: every supported product method requires credentials before parsing input", () => {
  it("returns 401 for list/read/create/update/delete even with malformed input", async () => {
    const responses: Response[] = [
      await listProductsRoute(makeRequest("/api/products?page=0&bogus=1")),
      await createProductRoute(makeRequest("/api/products", { method: "POST", body: "{not json" })),
      await getProductRoute(makeRequest("/api/products/not-a-uuid"), detail("not-a-uuid")),
      await updateProductRoute(makeRequest("/api/products/not-a-uuid", { method: "PATCH", body: "{}" }), detail("not-a-uuid")),
      await deleteProductRoute(makeRequest("/api/products/not-a-uuid", { method: "DELETE", body: "{}" }), detail("not-a-uuid")),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await readErrorBody(response)).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
  });

  it("returns 401 for an unknown or copied session cookie", async () => {
    const response = await listProductsRoute(makeRequest("/api/products", withCookie("better-auth.session_token=forged-token")));
    expect(response.status).toBe(401);
    expect((await readErrorBody(response)).error.code).toBe("UNAUTHORIZED");
  });
});

describe("A6 N6: authenticated mutations reject a missing or foreign Origin", () => {
  it("returns 403 and writes nothing for missing/foreign origins", async () => {
    const owner = await registerAndLogin();
    const body = productBody();

    const foreign = await createProductRoute(makeRequest("/api/products", jsonInit("POST", body, owner.cookie, { origin: "http://evil.example" })));
    expect(foreign.status).toBe(403);
    expect(await readErrorBody(foreign)).toEqual({ error: { code: "ORIGIN_REJECTED", message: "Request origin is not allowed" } });

    const withoutOrigin = new Request(new URL("/api/products", TRUSTED_ORIGIN), {
      method: "POST",
      headers: { cookie: owner.cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect((await createProductRoute(withoutOrigin)).status).toBe(403);

    const product = await createProductFixture(owner.user.id);
    const foreignPatch = await patch(owner.cookie, product.id, { version: product.version, name: "Hijacked" }, { origin: "http://evil.example" });
    const foreignDelete = await remove(owner.cookie, product.id, { version: product.version }, { origin: "http://evil.example" });
    expect([foreignPatch.status, foreignDelete.status]).toEqual([403, 403]);

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row).toMatchObject({ name: product.name, version: product.version, deletedAt: null });
    expect(await getPrisma().product.count()).toBe(1);
  });
});

describe("A7 I1: products are strictly owner-scoped", () => {
  it("hides another user's product and refuses to read, update or delete it", async () => {
    const alice = await registerAndLogin();
    const bob = await registerAndLogin();
    const product = await createProductFixture(alice.user.id, { sku: "ALICE-ONLY", name: "Alice Bolt", unitPrice: 999 });

    const bobSearch = await list(bob.cookie, "search=ALICE");
    expect(bobSearch.status).toBe(200);
    expect(await bobSearch.json()).toEqual({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    expect(idsOf(await pageOf(await list(bob.cookie)))).toEqual([]);

    const readByBob = await read(bob.cookie, product.id);
    const patchByBob = await patch(bob.cookie, product.id, { version: product.version, name: "Bob owns this" });
    const deleteByBob = await remove(bob.cookie, product.id, { version: product.version });
    expect([readByBob.status, patchByBob.status, deleteByBob.status]).toEqual([404, 404, 404]);
    for (const response of [readByBob, patchByBob, deleteByBob]) {
      expect(await readErrorBody(response)).toEqual({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row).toMatchObject({ name: "Alice Bolt", version: product.version, deletedAt: null });
    expect((await read(alice.cookie, product.id)).status).toBe(200);
  });

  it("allows the same normalized SKU for two users and keeps their lists disjoint", async () => {
    const alice = await registerAndLogin();
    const bob = await registerAndLogin();
    const body = productBody({ sku: "shared-sku", name: "Shared SKU" });

    const aliceCreated = await create(alice.cookie, body);
    const bobCreated = await create(bob.cookie, body);
    expect([aliceCreated.status, bobCreated.status]).toEqual([201, 201]);
    const aliceProduct = await dataOf(aliceCreated);
    const bobProduct = await dataOf(bobCreated);
    expect(aliceProduct.sku).toBe("SHARED-SKU");
    expect(aliceProduct.id).not.toBe(bobProduct.id);

    expect(await search(alice.cookie, "shared")).toEqual([aliceProduct.id]);
    expect(await search(bob.cookie, "shared")).toEqual([bobProduct.id]);
  });
});

describe("I1: owned product CRUD with soft delete", () => {
  it("creates, reads, updates, lists and soft-deletes an owned product", async () => {
    const owner = await registerAndLogin();
    const created = await create(owner.cookie, { sku: "  crud-1  ", name: "  CRUD Widget  ", description: "  keep me  ", unitPrice: 1999, quantityOnHand: 7 });
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const product = await dataOf(created);
    expect(Object.keys(product).sort()).toEqual(["createdAt", "description", "id", "name", "quantityOnHand", "sku", "unitPrice", "updatedAt", "version"]);
    expect(product).toMatchObject({ sku: "CRUD-1", name: "CRUD Widget", description: "keep me", unitPrice: 1999, quantityOnHand: 7, version: 0 });
    expect(new Date(product.createdAt).toISOString()).toBe(product.createdAt);

    const stored = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stored).toMatchObject({ userId: owner.user.id, deletedAt: null });

    const detailResponse = await read(owner.cookie, product.id);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers.get("cache-control")).toBe("no-store");
    expect(await dataOf(detailResponse)).toEqual(product);

    const patched = await patch(owner.cookie, product.id, { version: 0, name: "Renamed Widget", quantityOnHand: 4, description: null });
    expect(patched.status).toBe(200);
    expect(await dataOf(patched)).toMatchObject({
      id: product.id, sku: "CRUD-1", name: "Renamed Widget", description: null, unitPrice: 1999, quantityOnHand: 4, version: 1,
    });

    const listed = await pageOf(await list(owner.cookie));
    expect(listed.data.map((item) => item.id)).toEqual([product.id]);
    expect(listed.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });

    const removed = await remove(owner.cookie, product.id, { version: 1 });
    expect(removed.status).toBe(204);
    expect(removed.headers.get("cache-control")).toBe("no-store");
    expect(await removed.text()).toBe("");

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({ sku: "CRUD-1", version: 2 });
    expect((await read(owner.cookie, product.id)).status).toBe(404);
    expect(await pageOf(await list(owner.cookie))).toEqual({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });

  it("defaults an omitted description to null and accepts zero money/stock", async () => {
    const owner = await registerAndLogin();
    const created = await create(owner.cookie, { sku: "NO-DESC", name: "No description", unitPrice: 0, quantityOnHand: 0 });
    expect(created.status).toBe(201);
    expect(await dataOf(created)).toMatchObject({ description: null, unitPrice: 0, quantityOnHand: 0, version: 0 });
  });
});

describe("I2: case-insensitive search and stable pagination", () => {
  it("matches name and SKU substrings in any case and excludes deleted rows", async () => {
    const owner = await registerAndLogin();
    const alpha = await createProductFixture(owner.user.id, { sku: "SKU-ALPHA-1", name: "Alpha Bolt" });
    const beta = await createProductFixture(owner.user.id, { sku: "PART-100", name: "Beta Bracket" });
    const gamma = await createProductFixture(owner.user.id, { sku: "GAMMA-NUT", name: "Gamma Nut" });

    expect(await search(owner.cookie, "alpha")).toEqual([alpha.id]);
    expect(await search(owner.cookie, "BETA")).toEqual([beta.id]);
    expect(await search(owner.cookie, "gamma")).toEqual([gamma.id]);
    expect(await search(owner.cookie, "SKU-ALP")).toEqual([alpha.id]);
    expect(await search(owner.cookie, "nomatch")).toEqual([]);
    expect(new Set(await search(owner.cookie, "   "))).toEqual(new Set([alpha.id, beta.id, gamma.id]));

    expect((await remove(owner.cookie, alpha.id, { version: alpha.version })).status).toBe(204);
    expect(await search(owner.cookie, "alpha")).toEqual([]);
    expect(new Set(await search(owner.cookie, ""))).toEqual(new Set([beta.id, gamma.id]));
  });

  it("paginates deterministically without overlaps and reports totals for the same search", async () => {
    const owner = await registerAndLogin();
    const products: ProductDto[] = [];
    for (let index = 0; index < 5; index += 1) {
      products.push(await createProductFixture(owner.user.id, { sku: `PAGED-${index}`, name: `Paged Widget ${index}` }));
    }

    const full = await pageOf(await list(owner.cookie, "pageSize=100"));
    expect(full.pagination).toEqual({ page: 1, pageSize: 100, total: 5, totalPages: 1 });
    expect(full.data).toHaveLength(5);
    const order = full.data.map((product) => [product.createdAt, product.id] as const);
    expect(order).toEqual([...order].sort((left, right) => (left[0] === right[0] ? (left[1] < right[1] ? -1 : 1) : left[0] < right[0] ? 1 : -1)));

    const [first, second, third] = await Promise.all([1, 2, 3].map((page) => list(owner.cookie, `page=${page}&pageSize=2`).then(pageOf)));
    expect([first.pagination, second.pagination, third.pagination]).toEqual([
      { page: 1, pageSize: 2, total: 5, totalPages: 3 },
      { page: 2, pageSize: 2, total: 5, totalPages: 3 },
      { page: 3, pageSize: 2, total: 5, totalPages: 3 },
    ]);
    const pagedIds = [...first.data, ...second.data, ...third.data].map((product) => product.id);
    expect(pagedIds).toEqual(full.data.map((product) => product.id));

    expect(await pageOf(await list(owner.cookie, "page=4&pageSize=2"))).toEqual({
      data: [], pagination: { page: 4, pageSize: 2, total: 5, totalPages: 3 },
    });

    const filtered = await pageOf(await list(owner.cookie, "search=Widget%204&pageSize=2"));
    expect(filtered.pagination).toEqual({ page: 1, pageSize: 2, total: 1, totalPages: 1 });
    expect(filtered.data.map((product) => product.name)).toEqual(["Paged Widget 4"]);

    expect((await remove(owner.cookie, products[0]!.id, { version: products[0]!.version })).status).toBe(204);
    expect((await pageOf(await list(owner.cookie, "pageSize=2"))).pagination).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
  });
});

describe("I3: validation and duplicate-SKU field errors", () => {
  it("reports duplicate SKU, including case/whitespace variants, as a 409 field error", async () => {
    const owner = await registerAndLogin();
    expect((await create(owner.cookie, { sku: "DUP-1", name: "First", unitPrice: 100, quantityOnHand: 1 })).status).toBe(201);
    for (const sku of ["DUP-1", " dup-1 ", "Dup-1"]) {
      const duplicate = await create(owner.cookie, { sku, name: "Second", unitPrice: 100, quantityOnHand: 1 });
      expect(duplicate.status, sku).toBe(409);
      const error = (await readErrorBody(duplicate)).error;
      expect(error.code).toBe("DUPLICATE_SKU");
      expect(error.fields?.sku).toEqual([expect.any(String)]);
    }
    expect(await getPrisma().product.count()).toBe(1);
  });

  it("rejects missing, negative, fractional and out-of-range create fields with 422 field errors", async () => {
    const owner = await registerAndLogin();
    const invalid: [Record<string, unknown>, string[]][] = [
      [{}, ["sku", "name", "unitPrice", "quantityOnHand"]],
      [{ sku: "OK-1", name: "Missing price", quantityOnHand: 1 }, ["unitPrice"]],
      [{ sku: "OK-2", name: "Negative price", unitPrice: -1, quantityOnHand: 1 }, ["unitPrice"]],
      [{ sku: "OK-3", name: "Fractional price", unitPrice: 10.5, quantityOnHand: 1 }, ["unitPrice"]],
      [{ sku: "OK-4", name: "Overflowing price", unitPrice: 2147483648, quantityOnHand: 1 }, ["unitPrice"]],
      [{ sku: "OK-5", name: "Negative stock", unitPrice: 0, quantityOnHand: -1 }, ["quantityOnHand"]],
      [{ sku: "OK-6", name: "Fractional stock", unitPrice: 0, quantityOnHand: 1.5 }, ["quantityOnHand"]],
      [{ sku: "OK-7", name: "Huge stock", unitPrice: 0, quantityOnHand: 1000001 }, ["quantityOnHand"]],
      [{ sku: "   ", name: "Empty SKU", unitPrice: 0, quantityOnHand: 0 }, ["sku"]],
      [{ sku: "OK-8", name: "   ", unitPrice: 0, quantityOnHand: 0 }, ["name"]],
      [{ sku: "OK-9", name: "x".repeat(201), unitPrice: 0, quantityOnHand: 0 }, ["name"]],
      [{ sku: "OK-10", name: "Long description", description: "y".repeat(2001), unitPrice: 0, quantityOnHand: 0 }, ["description"]],
      [{ sku: "OK-11", name: "Owned", unitPrice: 0, quantityOnHand: 0, userId: randomUUID() }, ["userId"]],
      [{ sku: "OK-12", name: "Versioned", unitPrice: 0, quantityOnHand: 0, version: 3 }, ["version"]],
      [{ sku: "OK-13", name: "Deleted", unitPrice: 0, quantityOnHand: 0, deletedAt: new Date().toISOString() }, ["deletedAt"]],
    ];
    for (const [body, fields] of invalid) {
      const response = await create(owner.cookie, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
      const error = (await readErrorBody(response)).error;
      expect(error.code).toBe("VALIDATION_ERROR");
      for (const field of fields) expect(error.fields?.[field], `${field} in ${JSON.stringify(body)}`).toEqual(expect.any(Array));
    }
    expect(await getPrisma().product.count()).toBe(0);
  });

  it("rejects invalid pagination and unknown query parameters with 422 field errors", async () => {
    const owner = await registerAndLogin();
    const cases: [string, string][] = [
      ["page=0", "page"],
      ["page=abc", "page"],
      ["pageSize=0", "pageSize"],
      ["pageSize=101", "pageSize"],
      ["page=9007199254740991&pageSize=100", "page"],
      ["sort=name", "sort"],
    ];
    for (const [query, field] of cases) {
      const response = await list(owner.cookie, query);
      expect(response.status, query).toBe(422);
      expect((await readErrorBody(response)).error.fields?.[field], query).toEqual(expect.any(Array));
    }
  });

  it("rejects invalid updates and deletes with 422 field errors and leaves the row intact", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id, { name: "Untouched" });
    const invalidPatches: [unknown, string][] = [
      [{ version: 0 }, "_root"],
      [{ name: "No version" }, "version"],
      [{ version: -1, name: "Negative version" }, "version"],
      [{ version: 0, unitPrice: -5 }, "unitPrice"],
      [{ version: 0, unitPrice: 1.5 }, "unitPrice"],
      [{ version: 0, quantityOnHand: -2 }, "quantityOnHand"],
      [{ version: 0, name: "   " }, "name"],
      [{ version: 0, userId: randomUUID() }, "userId"],
      [{ version: 0, deletedAt: new Date().toISOString() }, "deletedAt"],
    ];
    for (const [body, field] of invalidPatches) {
      const response = await patch(owner.cookie, product.id, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
      expect((await readErrorBody(response)).error.fields?.[field], `${field} in ${JSON.stringify(body)}`).toEqual(expect.any(Array));
    }

    const invalidDeletes: [unknown, string][] = [[{}, "version"], [{ version: -1 }, "version"], [{ version: 0, extra: true }, "extra"]];
    for (const [body, field] of invalidDeletes) {
      const response = await remove(owner.cookie, product.id, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
      expect((await readErrorBody(response)).error.fields?.[field], `${field} in ${JSON.stringify(body)}`).toEqual(expect.any(Array));
    }

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row).toMatchObject({ name: "Untouched", version: 0, deletedAt: null });
  });
});

describe("N6: consistent JSON errors, version conflicts and id handling", () => {
  it("returns 400 for non-JSON and malformed JSON bodies", async () => {
    const owner = await registerAndLogin();
    const body = productBody();
    const wrongType = await createProductRoute(makeRequest("/api/products", {
      method: "POST", body: JSON.stringify(body), headers: { cookie: owner.cookie, "content-type": "text/plain" },
    }));
    expect(wrongType.status).toBe(400);
    expect((await readErrorBody(wrongType)).error.code).toBe("INVALID_JSON");

    const malformed = await createProductRoute(makeRequest("/api/products", { ...jsonInit("POST", "{ nope", owner.cookie) }));
    expect(malformed.status).toBe(400);
    expect((await readErrorBody(malformed)).error.code).toBe("INVALID_JSON");
    expect(await getPrisma().product.count()).toBe(0);
  });

  it("returns 422 for a malformed path id and 404 for an unknown or uppercase UUID", async () => {
    const owner = await registerAndLogin();
    const malformed = await getProductRoute(makeRequest("/api/products/not-a-uuid", withCookie(owner.cookie)), detail("not-a-uuid"));
    expect(malformed.status).toBe(422);
    expect((await readErrorBody(malformed)).error.fields?.id).toEqual(expect.any(Array));

    const unknown = randomUUID();
    expect(await readErrorBody(await read(owner.cookie, unknown))).toEqual({ error: { code: "NOT_FOUND", message: "Product not found" } });
    expect((await read(owner.cookie, unknown.toUpperCase())).status).toBe(404);
    expect((await patch(owner.cookie, unknown, { version: 0, name: "Nobody" })).status).toBe(404);
    expect((await remove(owner.cookie, unknown, { version: 0 })).status).toBe(404);
  });

  it("returns 409 for stale versions and keeps the stored row intact", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id, { name: "Version Guard", unitPrice: 500 });

    const first = await patch(owner.cookie, product.id, { version: 0, name: "First write" });
    expect(first.status).toBe(200);
    expect((await dataOf(first)).version).toBe(1);

    for (const version of [0, 7]) {
      const stale = await patch(owner.cookie, product.id, { version, name: "Stale write" });
      expect(stale.status).toBe(409);
      expect(await readErrorBody(stale)).toEqual({ error: { code: "VERSION_CONFLICT", message: "The product changed; reload and retry" } });
    }
    expect((await remove(owner.cookie, product.id, { version: 0 })).status).toBe(409);

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row).toMatchObject({ name: "First write", version: 1, quantityOnHand: product.quantityOnHand, deletedAt: null });
  });

  it("serializes concurrent updates so exactly one writer wins", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id);
    const [left, right] = await Promise.all([
      patch(owner.cookie, product.id, { version: 0, name: "Left" }),
      patch(owner.cookie, product.id, { version: 0, name: "Right" }),
    ]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row.version).toBe(1);
    expect(["Left", "Right"]).toContain(row.name);
  });
});

describe("I4: soft delete preserves invoice references and reserves the SKU", () => {
  it("keeps the invoice item snapshot and blocks recreating the deleted SKU", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id, { sku: "REF-KEEP", name: "Referenced Part", unitPrice: 2500 });
    const invoice = await getPrisma().invoice.create({
      data: {
        userId: owner.user.id,
        invoiceNumber: `INV-2026-${randomUUID()}`,
        customerName: "Acme",
        issueDate: new Date("2026-01-02T00:00:00.000Z"),
        dueDate: new Date("2026-01-09T00:00:00.000Z"),
        taxRateBps: 1100,
        subtotal: 2500,
        taxAmount: 275,
        total: 2775,
        items: { create: { productId: product.id, productName: product.name, unitPrice: product.unitPrice, quantity: 1, lineTotal: 2500, position: 1 } },
      },
      include: { items: true },
    });

    expect((await remove(owner.cookie, product.id, { version: product.version })).status).toBe(204);

    const item = await getPrisma().invoiceItem.findUniqueOrThrow({ where: { id: invoice.items[0]!.id } });
    expect(item).toMatchObject({ productId: product.id, productName: "Referenced Part", unitPrice: 2500, quantity: 1 });
    const storedInvoice = await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: true } });
    expect(storedInvoice.items).toHaveLength(1);
    expect((await read(owner.cookie, product.id)).status).toBe(404);

    const recreated = await create(owner.cookie, { sku: "ref-keep", name: "Replacement", unitPrice: 100, quantityOnHand: 1 });
    expect(recreated.status).toBe(409);
    expect((await readErrorBody(recreated)).error.fields?.sku).toEqual([expect.any(String)]);
    expect(await getPrisma().product.count()).toBe(1);
  });

  it("cannot resurrect a deleted product through an update", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id, { name: "Deleted Part" });
    expect((await remove(owner.cookie, product.id, { version: product.version })).status).toBe(204);

    const resurrect = await patch(owner.cookie, product.id, { version: product.version + 1, name: "Resurrected" });
    expect(resurrect.status).toBe(404);
    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row).toMatchObject({ name: "Deleted Part" });
    expect(row.deletedAt).toBeInstanceOf(Date);
  });
});

describe("I2: search treats LIKE metacharacters as literal text", () => {
  it("never lets % or _ act as wildcards", async () => {
    const owner = await registerAndLogin();
    const discounted = await createProductFixture(owner.user.id, { sku: "PCT-1000", name: "Discount 50% sticker" });
    await createProductFixture(owner.user.id, { sku: "PLAIN-1", name: "Plain widget" });

    // `%` matches only the row that literally contains one — never every row (the bug returned both).
    expect(await search(owner.cookie, "%")).toEqual([discounted.id]);
    expect(idsOf(await pageOf(await list(owner.cookie)))).toHaveLength(2);
    // `_` is literal: no row contains one, and it must not stand in for any single character.
    expect(await search(owner.cookie, "_")).toEqual([]);
    expect(await search(owner.cookie, "PCT_1")).toEqual([]);
    // A literal metacharacter inside real data is still searchable.
    expect(await search(owner.cookie, "50%")).toEqual([discounted.id]);
    expect(await search(owner.cookie, "50% s")).toEqual([discounted.id]);
    // A literal backslash is inert too.
    expect(await search(owner.cookie, "\\")).toEqual([]);
  });
});

describe("I3 N6: SKU collision paths and input boundaries", () => {
  it("rejects renaming a product onto another product's SKU", async () => {
    const owner = await registerAndLogin();
    const taken = await createProductFixture(owner.user.id, { sku: "TAKEN-1" });
    const free = await createProductFixture(owner.user.id, { sku: "FREE-1" });

    // The variant also exercises normalization on the update path.
    const conflict = await patch(owner.cookie, free.id, { version: free.version, sku: " taken-1 " });
    expect(conflict.status).toBe(409);
    const error = (await readErrorBody(conflict)).error;
    expect(error.code).toBe("DUPLICATE_SKU");
    expect(error.fields?.sku).toEqual([expect.any(String)]);

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: free.id } });
    expect(row).toMatchObject({ sku: "FREE-1", version: free.version, name: free.name });
    expect(await getPrisma().product.count()).toBe(2);
    void taken;
  });

  it("awards one SKU to exactly one of two concurrent creates", async () => {
    const owner = await registerAndLogin();
    const body = { sku: "RACE-1", name: "Race", unitPrice: 100, quantityOnHand: 1 };

    const [left, right] = await Promise.all([create(owner.cookie, body), create(owner.cookie, body)]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await getPrisma().product.count({ where: { sku: "RACE-1" } })).toBe(1);
  });

  it("accepts a 64-character SKU and rejects 65", async () => {
    const owner = await registerAndLogin();
    const atLimit = await create(owner.cookie, { sku: "S".repeat(64), name: "At the limit", unitPrice: 0, quantityOnHand: 0 });
    expect(atLimit.status).toBe(201);
    expect((await dataOf(atLimit)).sku).toHaveLength(64);

    const tooLong = await create(owner.cookie, { sku: "T".repeat(65), name: "Too long", unitPrice: 0, quantityOnHand: 0 });
    expect(tooLong.status).toBe(422);
    expect((await readErrorBody(tooLong)).error.fields?.sku).toEqual(expect.any(Array));
    expect(await getPrisma().product.count()).toBe(1);
  });

  it("requires a JSON body on DELETE and deletes nothing without one", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id);

    const bare = await deleteProductRoute(makeRequest(`/api/products/${product.id}`, withCookie(owner.cookie)), detail(product.id));
    expect(bare.status).toBe(400);
    expect((await readErrorBody(bare)).error.code).toBe("INVALID_JSON");

    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row).toMatchObject({ deletedAt: null, version: product.version });
  });

  it("accepts a PATCH that only clears the description", async () => {
    const owner = await registerAndLogin();
    const product = await createProductFixture(owner.user.id, { description: "before" });

    const cleared = await patch(owner.cookie, product.id, { version: product.version, description: null });
    expect(cleared.status).toBe(200);
    expect(await dataOf(cleared)).toMatchObject({ description: null, version: product.version + 1, name: product.name });
  });
});
