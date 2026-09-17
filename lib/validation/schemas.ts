import { z } from "zod";

const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = z.string().trim().max(2000).nullable().optional();
export const domainIdSchema = z.uuid().transform((id) => id.toLowerCase());
export const invoiceStatusSchema = z.enum(["DRAFT", "ISSUED", "PAID", "CANCELLED"]);
export const versionSchema = integer(0, 2147483647);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const loginPasswordSchema = z.string().min(1).refine((value) => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes");
export const registerPasswordSchema = loginPasswordSchema.refine((value) => Array.from(value).length >= 8, "Password must contain at least 8 characters");
export const registerSchema = z.strictObject({ email, password: registerPasswordSchema });
export const loginSchema = z.strictObject({ email, password: loginPasswordSchema });
const productFields = { sku: z.string().trim().toUpperCase().min(1).max(64), name: text(200), description: optionalText, unitPrice: integer(0, 2147483647), quantityOnHand: integer(0, 1000000) };
export const createProductSchema = z.strictObject(productFields);
export const updateProductSchema = createProductSchema.partial().extend({ version: versionSchema }).refine((input) => Object.entries(input).some(([key, value]) => key !== "version" && value !== undefined), "At least one mutable field is required");
export const deleteProductSchema = z.strictObject({ version: versionSchema });

const queryInteger = (max: number, fallback: string) => z.string().regex(/^\d+$/).default(fallback).transform(Number).pipe(integer(1, max));
const paginationFields = { page: queryInteger(Number.MAX_SAFE_INTEGER, "1"), pageSize: queryInteger(100, "20") };
const safeOffset = (input: { page: number; pageSize: number }) => Number.isSafeInteger((input.page - 1) * input.pageSize);
export const paginationSchema = z.strictObject(paginationFields).refine(safeOffset, { path: ["page"], message: "Pagination offset is unsafe" });
export const productListSchema = z.strictObject({ ...paginationFields, search: z.string().trim().max(200).default("") }).refine(safeOffset, { path: ["page"], message: "Pagination offset is unsafe" });
export const invoiceListSchema = z.strictObject({ ...paginationFields, status: invoiceStatusSchema.optional() }).refine(safeOffset, { path: ["page"], message: "Pagination offset is unsafe" });

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return value.slice(0, 4) !== "0000" && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Expected a real YYYY-MM-DD calendar date");
export const invoiceLineSchema = z.strictObject({ productId: domainIdSchema, quantity: integer(1, 1000000) });
const items = z.array(invoiceLineSchema).min(1).max(100).superRefine((lines, ctx) => {
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    if (seen.has(line.productId)) ctx.addIssue({ code: "custom", path: [index, "productId"], message: "Duplicate product" });
    seen.add(line.productId);
  });
});
export const createInvoiceSchema = z.strictObject({ customerName: text(200), issueDate: calendarDateSchema, dueDate: calendarDateSchema, notes: optionalText, items }).refine((input) => input.dueDate >= input.issueDate, { path: ["dueDate"], message: "Due date must be on or after issue date" });
export const replaceInvoiceItemsSchema = z.strictObject({ version: versionSchema, items });
export const transitionInvoiceSchema = z.strictObject({ version: versionSchema, status: z.enum(["ISSUED", "PAID", "CANCELLED"]) });
export const emptyBodySchema = z.strictObject({});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DeleteProductInput = z.infer<typeof deleteProductSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ProductListInput = z.infer<typeof productListSchema>;
export type InvoiceListInput = z.infer<typeof invoiceListSchema>;
export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type ReplaceInvoiceItemsInput = z.infer<typeof replaceInvoiceItemsSchema>;
export type TransitionInvoiceInput = z.infer<typeof transitionInvoiceSchema>;
