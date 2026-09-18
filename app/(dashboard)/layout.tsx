import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth/session";

/**
 * Dashboard shell. The session is validated here for navigation, and every page below repeats it
 * before loading data: a layout is never the only authorization for private content.
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
          <nav aria-label="Main" className="flex flex-1 items-center gap-4 text-sm">
            <Link className="text-muted-foreground hover:text-foreground" href="/products">
              Products
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" href="/invoices">
              Invoices
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" href="/docs">
              API docs
            </Link>
          </nav>
          <span className="text-muted-foreground hidden truncate text-sm sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
