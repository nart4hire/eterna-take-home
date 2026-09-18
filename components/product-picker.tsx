"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Page, ProductDto } from "@/lib/types";

/** One catalogue page per request: the picker reaches every product by paging, never by loading 100+. */
const PAGE_SIZE = 20;

export type ProductPickerProps = {
  /** Product ids already on the invoice; the API rejects duplicates, so they cannot be added twice. */
  selectedProductIds: readonly string[];
  /** Adds the current snapshot of the chosen product as a new invoice line. */
  onSelect: (product: ProductDto) => void;
  /** True while the invoice form is saving, so the line set cannot change under the request. */
  disabled?: boolean;
};

/** The last completed request, tagged with what was asked for, so "in flight" is a derived state. */
type LoadedPage = { key: string; result: Page<ProductDto> | null; failure: string | null };

/**
 * Paginated product search for the invoice line editor.
 *
 * The picker is the one part of the invoice screens that talks to the API directly: it queries the
 * documented `GET /api/products` endpoint (name/SKU search, page and pageSize) through `apiFetch`,
 * so choosing from a catalogue larger than the first 100 products means walking the pages instead of
 * loading them all. Chosen products live in the form's state, not here.
 */
export function ProductPicker({ selectedProductIds, onSelect, disabled = false }: ProductPickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retryToken, setRetryToken] = useState(0);
  const [loaded, setLoaded] = useState<LoadedPage | null>(null);

  // Every request is identified by what it asked for, so "still loading" is derived instead of a
  // second piece of state: the effect only ever writes the completed answer.
  const requestKey = JSON.stringify([search, page, retryToken]);
  const loading = loaded?.key !== requestKey;
  const result = loaded?.key === requestKey ? loaded.result : null;
  const failure = loaded?.key === requestKey ? loaded.failure : null;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    apiFetch<Page<ProductDto>>(`/api/products?${params.toString()}`)
      .then((response) => {
        if (active) setLoaded({ key: requestKey, result: response, failure: null });
      })
      .catch((error: unknown) => {
        if (active) {
          setLoaded({
            key: requestKey,
            result: null,
            failure: error instanceof ApiClientError ? error.body.error.message : "An unexpected error occurred",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [page, requestKey, search]);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch(): void {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  const pagination = result?.pagination;
  const first = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const last = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;
  const selected = new Set(selectedProductIds);

  return (
    <div className="space-y-4">
      <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2" aria-busy={loading}>
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="product-picker-search">Find a product</Label>
          <Input
            id="product-picker-search"
            name="search"
            type="search"
            autoComplete="off"
            placeholder="Name or SKU"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            disabled={disabled}
          />
        </div>
        <Button type="submit" variant="outline" disabled={disabled}>
          Search catalogue
        </Button>
        {search ? (
          <Button type="button" variant="ghost" disabled={disabled} onClick={clearSearch}>
            Clear
          </Button>
        ) : null}
      </form>

      <p className="text-muted-foreground text-sm">
        Search covers the whole catalogue — page through the results to reach products past the first {PAGE_SIZE} matches.
      </p>

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>The catalogue could not be loaded</AlertTitle>
          <AlertDescription>
            <p>{failure}</p>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setRetryToken((token) => token + 1)}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">Loading products…</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      ) : null}

      {!loading && !failure && result && result.pagination.total === 0 ? (
        <div className="border-border bg-card text-card-foreground rounded-xl border p-4">
          {search ? (
            <>
              <p className="font-medium">No products match “{search}”.</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Search looks at the product name and SKU.{" "}
                <button type="button" className="text-foreground underline underline-offset-4" disabled={disabled} onClick={clearSearch}>
                  Clear the search
                </button>{" "}
                to see every product.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No products yet.</p>
              <p className="text-muted-foreground mt-1 text-sm">An invoice line has to reference one of your products.</p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/products/new">Add a product</Link>
              </Button>
            </>
          )}
        </div>
      ) : null}

      {!loading && !failure && result && result.pagination.total > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">SKU</TableHead>
                <TableHead scope="col">Product</TableHead>
                <TableHead scope="col" className="text-right">
                  Unit price
                </TableHead>
                <TableHead scope="col" className="text-right">
                  In stock
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Add
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((product) => {
                const alreadyAdded = selected.has(product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(product.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{product.quantityOnHand}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant={alreadyAdded ? "ghost" : "outline"}
                        size="sm"
                        disabled={disabled || alreadyAdded}
                        onClick={() => onSelect(product)}
                        aria-label={alreadyAdded ? `${product.name} is already on this invoice` : `Add ${product.name} to the invoice`}
                      >
                        {alreadyAdded ? "Added" : "Add line"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <nav aria-label="Product results" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Showing {first}–{last} of {pagination?.total} matching products
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || page <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {pagination?.page} of {Math.max(pagination?.totalPages ?? 1, 1)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !pagination || page >= pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}

