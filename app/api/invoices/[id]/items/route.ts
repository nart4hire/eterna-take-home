import { requireAuth } from "@/lib/auth/session";
import { AppError, assertSameOrigin, dataResponse, handleRoute, readJson } from "@/lib/http";
import { replaceInvoiceItems } from "@/lib/services/invoices";
import { domainIdSchema, replaceInvoiceItemsSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export type InvoiceItemsRouteContext = { params: Promise<{ id: string }> };

/** A malformed path id is input validation (422); unknown or unowned ids are 404 in the service. */
function parseId(raw: string): string {
  const result = domainIdSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Invalid input", { id: result.error.issues.map((issue) => issue.message) });
  }
  return result.data;
}

/** PUT /api/invoices/[id]/items -> 200 replaced draft item set guarded by the supplied version. */
export async function PUT(request: Request, context: InvoiceItemsRouteContext): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    assertSameOrigin(request);
    const id = parseId((await context.params).id);
    const input = await readJson(request, replaceInvoiceItemsSchema);
    return dataResponse(await replaceInvoiceItems(user.id, id, input));
  });
}
