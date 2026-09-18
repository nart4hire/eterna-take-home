export const runtime = "nodejs";

export type InvoiceStatusRouteContext = { params: Promise<{ id: string }> };

/** RED STAGE ONLY: T07 pins the lifecycle suite before the transition service exists. */
export function PATCH(_request: Request, _context: InvoiceStatusRouteContext): Promise<Response> {
  return Promise.resolve(Response.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Invoice lifecycle is not implemented yet" } },
    { status: 501, headers: { "cache-control": "no-store" } },
  ));
}
