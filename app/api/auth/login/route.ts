import { getAuth } from "@/lib/auth/server";
import { assertSameOrigin, forwardAuthResponse, handleRoute, readJson } from "@/lib/http";
import { loginSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/** POST /api/auth/login -> 200 public user plus every BetterAuth Set-Cookie header. */
export function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, loginSchema);
    const response = await getAuth().api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: request.headers,
      asResponse: true,
    });
    return forwardAuthResponse(response, "login");
  });
}

