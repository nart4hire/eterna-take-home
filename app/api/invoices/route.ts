import type { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin, dataResponse, handleRoute, readJson } from "@/lib/http";
import { createInvoice, listInvoices } from "@/lib/services/invoices";
import type { InvoiceSummaryDto, Page } from "@/lib/types";
import { createInvoiceSchema, invoiceListSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/** List responses use the documented Page envelope directly: { data, pagination }. */
const pageResponse = (result: Page<InvoiceSummaryDto>): Response =>
  Response.json(result, { status: 200, headers: { "cache-control": "no-store" } });

/** Query strings are validated by the same strict schema as bodies, so unknown keys are 422. */
function readQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const result = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!result.success) throw result.error;
  return result.data;
}

/** GET /api/invoices -> paginated owner-scoped summaries with an optional status filter. */
export function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    const query = readQuery(request, invoiceListSchema);
    return pageResponse(await listInvoices(user.id, query));
  });
}

/** POST /api/invoices -> 201 draft with server-computed snapshots and totals. */
export function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    assertSameOrigin(request);
    const input = await readJson(request, createInvoiceSchema);
    return dataResponse(await createInvoice(user.id, input), 201);
  });
}
