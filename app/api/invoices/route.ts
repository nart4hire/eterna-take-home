export const runtime = "nodejs";

/** Red-stage placeholder for T06: replaced by the real owner-scoped handlers in the implementation commit. */
const notImplemented = (): Response =>
  Response.json({ error: { code: "NOT_IMPLEMENTED", message: "T06 red stage" } }, { status: 501, headers: { "cache-control": "no-store" } });

export function GET(_request: Request): Response {
  void _request;
  return notImplemented();
}

export function POST(_request: Request): Response {
  void _request;
  return notImplemented();
}
