import { requireAuth } from "@/lib/auth/session";
import { AppError, assertSameOrigin, dataResponse, handleRoute, readJson } from "@/lib/http";
import { deleteProduct, getProduct, updateProduct } from "@/lib/services/products";
import { deleteProductSchema, domainIdSchema, updateProductSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export type ProductRouteContext = { params: Promise<{ id: string }> };

/** A malformed path id is input validation (422); unknown or unowned ids are 404 in the service. */
function parseId(raw: string): string {
  const result = domainIdSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Invalid input", { id: result.error.issues.map((issue) => issue.message) });
  }
  return result.data;
}

/** GET /api/products/[id] -> 200 owned product or 404. */
export async function GET(request: Request, context: ProductRouteContext): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    return dataResponse(await getProduct(user.id, parseId((await context.params).id)));
  });
}

/** PATCH /api/products/[id] -> 200 version-guarded partial update. */
export async function PATCH(request: Request, context: ProductRouteContext): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    assertSameOrigin(request);
    const id = parseId((await context.params).id);
    const input = await readJson(request, updateProductSchema);
    return dataResponse(await updateProduct(user.id, id, input));
  });
}

/** DELETE /api/products/[id] -> 204 soft delete guarded by the version in the JSON body. */
export async function DELETE(request: Request, context: ProductRouteContext): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    assertSameOrigin(request);
    const id = parseId((await context.params).id);
    const input = await readJson(request, deleteProductSchema);
    await deleteProduct(user.id, id, input);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  });
}
