export const runtime = "nodejs";

export type InvoiceItemsRouteContext = { params: Promise<{ id: string }> };

/** Red-stage placeholder for T06: replaced by the real owner-scoped handler in the implementation commit. */
const notImplemented = (): Response =>
  Response.json({ error: { code: "NOT_IMPLEMENTED", message: "T06 red stage" } }, { status: 501, headers: { "cache-control": "no-store" } });

export function PUT(_request: Request, _context: InvoiceItemsRouteContext): Response {
  void _request;
  void _context;
  return notImplemented();
}
