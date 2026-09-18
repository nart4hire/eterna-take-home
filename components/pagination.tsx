import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/types";

export type PaginationProps = {
  /** The pagination block of a Page<T> response. */
  pagination: Page<unknown>["pagination"];
  /** List route that renders the pages, e.g. "/products". */
  basePath: string;
  /** Filters to preserve across pages (search, status, ...); empty values are dropped. */
  query?: Record<string, string | undefined>;
};

function pageHref(basePath: string, page: number, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/**
 * Query-driven pagination: the page number lives in the URL, so lists stay shareable and a
 * server-rendered refresh always matches what is on screen.
 */
export function Pagination({ pagination, basePath, query = {} }: PaginationProps) {
  const { page, pageSize, total, totalPages } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const previous = page > 1 ? pageHref(basePath, page - 1, query) : null;
  const next = page < totalPages ? pageHref(basePath, page + 1, query) : null;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-3">
        {previous ? (
          <Button asChild variant="outline" size="sm">
            <Link href={previous} rel="prev">
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        <span className="text-muted-foreground text-sm">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        {next ? (
          <Button asChild variant="outline" size="sm">
            <Link href={next} rel="next">
              Next
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </nav>
  );
}
