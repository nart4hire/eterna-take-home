import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { AppError } from "@/lib/http";
import type { SessionUser } from "@/lib/types";

/** Only the public fields leave this module: tokens, expiry and hashes never do. */
export async function getSessionUser(requestHeaders: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Route-handler guard: explicit headers in, 401 out. Every protected operation calls this. */
export async function requireAuth(requestHeaders: Headers): Promise<SessionUser> {
  const user = await getSessionUser(requestHeaders);
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return user;
}

/**
 * Page-only guard: reads the Next request scope and redirects unauthenticated visitors.
 * Layouts may call it for navigation, but it never replaces per-operation authorization.
 */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/login");
  return user;
}
