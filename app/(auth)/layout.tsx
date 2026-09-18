import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Public credential shell. Signed-in visitors are sent into the app instead of being shown the
 * forms again; the session is read from the database server-side, so a stale cookie is not enough.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers());
  if (user) redirect("/products");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="border-border bg-card text-card-foreground w-full max-w-sm rounded-xl border p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
