import { requireAuth } from "@/lib/auth/session";
import { AppError, assertSameOrigin, dataResponse, handleRoute, readJson } from "@/lib/http";
import { transitionInvoice } from "@/lib/services/invoices";
import { domainIdSchema, transitionInvoiceSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export type InvoiceStatusRouteContext = { params: Promise<{ id: string }> };

/** A malformed path id is input validation (422); unknown or unowned ids are 404 in the service. */
function parseId(raw: string): string {
  const result = domainIdSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Invalid input", { id: result.error.issues.map((issue) => issue.message) });
  }
  return result.data;
}

/** PATCH /api/invoices/[id]/status -> 200 detail after a version-guarded, stock-atomic transition. */
export async function PATCH(request: Request, context: InvoiceStatusRouteContext): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    assertSameOrigin(request);
    const id = parseId((await context.params).id);
    const input = await readJson(request, transitionInvoiceSchema);
    return dataResponse(await transitionInvoice(user.id, id, input));
  });
}
