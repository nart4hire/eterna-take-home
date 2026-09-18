export const runtime = "nodejs";

/** Temporary T05 red-stage skeleton: answers every method with 501 until the real handlers land. */
const notImplemented = (operation: string): Response =>
  new Response(JSON.stringify({ error: { code: "NOT_IMPLEMENTED", message: `${operation} is not implemented yet` } }), {
    status: 501,
    headers: { "content-type": "application/json" },
  });

export async function GET(request: Request): Promise<Response> { return notImplemented(`GET ${new URL(request.url).pathname}`); }
export async function POST(request: Request): Promise<Response> { return notImplemented(`POST ${new URL(request.url).pathname}`); }
