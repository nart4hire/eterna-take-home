import { requireAuth } from "@/lib/auth/session";
import { dataResponse, handleRoute } from "@/lib/http";

export const runtime = "nodejs";

/** GET /api/auth/session -> 200 public user or 401. Raw session tokens are never returned. */
export function GET(request: Request): Promise<Response> {
  return handleRoute(async () => dataResponse(await requireAuth(request.headers)));
}
