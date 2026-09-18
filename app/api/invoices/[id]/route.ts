import { requireAuth } from "@/lib/auth/session";
import { AppError, dataResponse, handleRoute } from "@/lib/http";
import { getInvoice } from "@/lib/services/invoices";
import { domainIdSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export type InvoiceRouteContext = { params: Promise<{ id: string }> };

/** A malformed path id is input validation (422); unknown or unowned ids are 404 in the service. */
function parseId(raw: string): string {
  const result = domainIdSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Invalid input", { id: result.error.issues.map((issue) => issue.message) });
  }
  return result.data;
}

/** GET /api/invoices/[id] -> 200 owned draft/detail with snapshotted items or 404. */
export async function GET(request: Request, context: InvoiceRouteContext): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    return dataResponse(await getInvoice(user.id, parseId((await context.params).id)));
  });
}
