"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavLinkProps = {
  /** Section route, e.g. "/products": every nested route under it counts as active. */
  href: string;
  children: ReactNode;
};

/**
 * Dashboard navigation link that marks the section the visitor is currently in.
 *
 * The shell is a server component, so the active state is resolved here with `usePathname()`:
 * the current path (query string excluded) decides the highlight, which keeps `/products`,
 * `/products/new` and `/products/<id>/edit` all marked as "Products" and sets `aria-current="page"`
 * so the state is announced and not colour-only.
 */
export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2 py-1 transition-colors",
        active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
