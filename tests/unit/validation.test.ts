import { describe, expect, it } from "vitest";
import { createInvoiceSchema, createProductSchema, deleteProductSchema, domainIdSchema, invoiceListSchema, loginSchema, paginationSchema, productListSchema, registerSchema, replaceInvoiceItemsSchema, transitionInvoiceSchema, updateProductSchema } from "@/lib/validation/schemas";

const id = "123e4567-e89b-42d3-a456-426614174000";
const product = { sku: " abc ", name: " Product ", unitPrice: 0, quantityOnHand: 0 };
const invoice = { customerName: " Customer ", issueDate: "2024-02-29", dueDate: "2024-03-01", items: [{ productId: id, quantity: 1 }] };

describe("I3 V2 N6: strict boundary contracts", () => {
  it("normalizes text but never coerces JSON numbers", () => {
    expect(createProductSchema.parse(product)).toEqual({ ...product, sku: "ABC", name: "Product" });
    expect(createProductSchema.safeParse({ ...product, unitPrice: "0" }).success).toBe(false);
    for (const key of ["userId", "deletedAt", "version", "total"]) expect(createProductSchema.safeParse({ ...product, [key]: 0 }).success).toBe(false);
    for (const unitPrice of [-1, 1.1, Infinity, 2147483648]) expect(createProductSchema.safeParse({ ...product, unitPrice }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...product, quantityOnHand: 1000001 }).success).toBe(false);
  });
  it("requires a mutable field and version for updates; supports null clearing", () => {
    expect(updateProductSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateProductSchema.parse({ version: 0, description: null }).description).toBeNull();
    expect(deleteProductSchema.parse({ version: 0 })).toEqual({ version: 0 });
    expect(deleteProductSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(deleteProductSchema.safeParse({ version: 0, name: "x" }).success).toBe(false);
  });
  it("bounds all text and domain identifiers", () => {
    for (const changes of [{ sku: " " }, { sku: "x".repeat(65) }, { sku: "ß".repeat(33) }, { name: "x".repeat(201) }, { description: "x".repeat(2001) }]) expect(createProductSchema.safeParse({ ...product, ...changes }).success).toBe(false);
    expect(domainIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(domainIdSchema.parse(id.toUpperCase())).toBe(id);
  });
});


describe("V2 N6: invoices and pagination", () => {
  it("validates real calendar dates and ordering", () => {
    expect(createInvoiceSchema.parse(invoice).issueDate).toBe("2024-02-29");
    for (const date of ["2023-02-29", "2024-04-31", "2024-13-01", "0000-01-01", "2024-2-01", "2024-02-29T00:00:00Z"]) expect(createInvoiceSchema.safeParse({ ...invoice, issueDate: date }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...invoice, dueDate: "2024-02-28" }).success).toBe(false);
  });
  it("rejects injected totals/snapshots and duplicate lines with indexed paths", () => {
    for (const key of ["userId", "subtotal", "taxRateBps", "status", "total"]) expect(createInvoiceSchema.safeParse({ ...invoice, [key]: 1 }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...invoice, items: [{ productId: id, quantity: 1, unitPrice: 1 }] }).success).toBe(false);
    const result = createInvoiceSchema.safeParse({ ...invoice, items: [...invoice.items, { productId: id.toUpperCase(), quantity: 2 }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.join(".") === "items.1.productId")).toBe(true);
    for (const items of [[], Array(101).fill(invoice.items[0]), [{ productId: id, quantity: 0 }], [{ productId: id, quantity: 1000001 }]]) expect(createInvoiceSchema.safeParse({ ...invoice, items }).success).toBe(false);
    expect(replaceInvoiceItemsSchema.parse({ version: 0, items: invoice.items }).version).toBe(0);
    expect(replaceInvoiceItemsSchema.safeParse({ items: invoice.items }).success).toBe(false);
    expect(transitionInvoiceSchema.safeParse({ version: 0, status: "DRAFT" }).success).toBe(false);
    expect(transitionInvoiceSchema.parse({ version: 1, status: "PAID" }).status).toBe("PAID");
  });
  it("bounds query pagination and safe offset, without permissive coercion", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(productListSchema.parse({ page: "2", pageSize: "100", search: " sku " })).toEqual({ page: 2, pageSize: 100, search: "sku" });
    for (const page of ["0", "-1", "1.5", "1e3", " 1", "", "9007199254740992", 1]) expect(paginationSchema.safeParse({ page }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: "9007199254740991", pageSize: "100" }).success).toBe(false);
    expect(paginationSchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(invoiceListSchema.parse({ status: "DRAFT" }).status).toBe("DRAFT");
    expect(invoiceListSchema.safeParse({ status: "unknown" }).success).toBe(false);
    expect(productListSchema.safeParse({ extra: "x" }).success).toBe(false);
  });
});

describe("A5: credential validation shared with auth", () => {
  it("normalizes email and preserves passwords exactly", () => {
    expect(registerSchema.parse({ email: " A@Example.COM ", password: " pass123 " })).toEqual({ email: "a@example.com", password: " pass123 " });
    expect(registerSchema.safeParse({ email: "bad", password: "password" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "password", name: "x" }).success).toBe(false);
  });
  it("counts Unicode code points and UTF-8 bytes; login enforces byte ceiling", () => {
    const credentials = (password: string) => ({ email: "a@b.com", password });
    expect(registerSchema.safeParse(credentials("😀".repeat(7))).success).toBe(false);
    expect(registerSchema.safeParse(credentials("😀".repeat(8))).success).toBe(true);
    expect(registerSchema.safeParse(credentials("é".repeat(36))).success).toBe(true);
    expect(registerSchema.safeParse(credentials("é".repeat(37))).success).toBe(false);
    expect(loginSchema.safeParse(credentials("x")).success).toBe(true);
    expect(loginSchema.safeParse(credentials("x".repeat(73))).success).toBe(false);
  });
});
