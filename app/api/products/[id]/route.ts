export const runtime = "nodejs";

/** Temporary T05 red-stage skeleton: answers every method with 501 until the real handlers land. */
const notImplemented = (operation: string): Response =>
  new Response(JSON.stringify({ error: { code: "NOT_IMPLEMENTED", message: `${operation} is not implemented yet` } }), {
    status: 501,
    headers: { "content-type": "application/json" },
  });

export type ProductRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: ProductRouteContext): Promise<Response> {
  const { id } = await context.params;
  return notImplemented(`GET /api/products/${id}`);
}

export async function PATCH(request: Request, context: ProductRouteContext): Promise<Response> {
  const { id } = await context.params;
  return notImplemented(`PATCH /api/products/${id}`);
}

export async function DELETE(request: Request, context: ProductRouteContext): Promise<Response> {
  const { id } = await context.params;
  return notImplemented(`DELETE /api/products/${id}`);
}
