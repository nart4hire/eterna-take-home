import { getAuth } from "@/lib/auth/server";
import { assertSameOrigin, forwardAuthResponse, handleRoute, readJson } from "@/lib/http";
import { emptyBodySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/** POST /api/auth/logout -> 204. BetterAuth revokes the session row and clears its cookies. */
export function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    assertSameOrigin(request);
    await readJson(request, emptyBodySchema);
    const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
    return forwardAuthResponse(response, "logout");
  });
}

