import { openApiDocument } from "@/lib/openapi";

export const runtime = "nodejs";

/**
 * GET /api/openapi.json -> the OpenAPI 3.1 document for this application.
 *
 * The specification is static and public: it exposes no user data, it is built entirely from local
 * modules, and the standalone viewer under `/docs` fetches it from the same origin. Nothing is
 * generated per request and no external validator or CDN is involved, so every caller receives the
 * same document.
 */
export function GET(): Response {
  return Response.json(openApiDocument, { status: 200, headers: { "cache-control": "no-store" } });
}
