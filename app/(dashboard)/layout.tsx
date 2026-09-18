import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { NavLink } from "@/components/nav-link";
import { requirePageUser } from "@/lib/auth/session";

/**
 * Dashboard shell. The session is validated here for navigation, and every page below repeats it
 * before loading data: a layout is never the only authorization for private content.
 *
 * Section links go through `NavLink`, which highlights the section the visitor is currently in.
 * Developer documentation (Swagger) is deliberately absent from the client navigation: the API spec
 * stays a machine-readable endpoint and its viewer is a separate surface (see T10).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            StockFlow
          </Link>
          <nav aria-label="Main" className="flex flex-1 items-center gap-2 text-sm">
            <NavLink href="/products">Products</NavLink>
            <NavLink href="/invoices">Invoices</NavLink>
          </nav>
          <span className="text-muted-foreground hidden truncate text-sm sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
