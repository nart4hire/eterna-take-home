export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
export type SessionUser = { id: string; email: string; name: string };
export type Page<T> = { data: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string[]> } };
export type ProductDto = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unitPrice: number;
  quantityOnHand: number;
  version: number;
  /** ISO timestamps, not Date objects. */
  createdAt: string;
  updatedAt: string;
};
export type InvoiceSummaryDto = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  /** Calendar dates in YYYY-MM-DD format. */
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string | null;
  taxRateBps: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type InvoiceItemDto = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  position: number;
};
export type InvoiceDetailDto = InvoiceSummaryDto & { items: InvoiceItemDto[] };
export type MoneyTotals = { lineTotals: number[]; subtotal: number; taxAmount: number; total: number };
export type { RegisterInput, LoginInput, CreateProductInput, UpdateProductInput, DeleteProductInput, PaginationInput, ProductListInput, InvoiceListInput, InvoiceLineInput, CreateInvoiceInput, ReplaceInvoiceItemsInput, TransitionInvoiceInput } from "@/lib/validation/schemas";
