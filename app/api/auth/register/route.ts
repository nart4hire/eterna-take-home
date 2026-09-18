import { getAuth } from "@/lib/auth/server";
import { assertSameOrigin, forwardAuthResponse, handleRoute, readJson } from "@/lib/http";
import { registerSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/** RegisterInput carries email and password only; the display name is derived from the email. */
const nameFromEmail = (email: string): string => email.slice(0, email.indexOf("@")).slice(0, 200) || "StockFlow user";

/**
 * Registration must not sign the client in. BetterAuth keeps reporting duplicates truthfully only
 * while `autoSignIn` is enabled, so that default is kept and the session it creates is revoked
 * through BetterAuth's own sign-out route. Result: no cookie reaches the client, and on the normal
 * path no usable session row is left behind.
 *
 * Revocation is best effort: if BetterAuth's sign-out fails, the account is already created, the
 * client has still received no token (`withoutCookies` strips every Set-Cookie header), and the
 * residual row is unreachable and expires with the session lifetime — so failing the whole request
 * with a 500 would only invite a retry that reports a confusing duplicate-email conflict.
 */
async function revokeAutomaticSession(response: Response): Promise<void> {
  if (!response.ok) return;
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  if (!cookie) return;
  try {
    await getAuth().api.signOut({ headers: new Headers({ cookie }), asResponse: true });
  } catch {
    // Deliberately logs no cookie/token material.
    console.error("Registration cleanup failed: the automatic session could not be revoked");
  }
}

/** Drops auth cookies while keeping the JSON body for the shared response wrapper. */
const withoutCookies = (response: Response): Response =>
  new Response(response.body, { status: response.status, headers: { "content-type": "application/json" } });

/** POST /api/auth/register -> 201 public user; duplicate -> generic 409. */
export function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, registerSchema);
    const response = await getAuth().api.signUpEmail({
      body: { name: nameFromEmail(input.email), email: input.email, password: input.password },
      headers: request.headers,
      asResponse: true,
    });
    await revokeAutomaticSession(response);
    return forwardAuthResponse(withoutCookies(response), "register");
  });
}

