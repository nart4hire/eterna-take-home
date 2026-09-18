"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pagination } from "@/components/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Page, ProductDto } from "@/lib/types";

export type ProductListProps = {
  /** The server-rendered page of owned products: the list never re-fetches rows client-side. */
  page: Page<ProductDto>;
  /** The committed search term, so the box always matches the rows on screen. */
  search: string;
};

/**
 * Product list with URL-driven search and pagination plus confirmed deletion.
 *
 * Rows arrive as serializable DTOs from the server page; searching navigates to `/products?search=…`
 * (a GET form, so it also works before hydration) and a successful or raced delete refreshes the
 * route instead of patching rows in place. A delete that fails stays on screen with a retry, and a
 * stale version is never retried blindly — the refreshed list has to be reviewed first.
 */
export function ProductList({ page, search }: ProductListProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<ProductDto | null>(null);
  const { data, pagination } = page;

  async function confirmDelete(product: ProductDto): Promise<void> {
    if (pendingId) return;
    setPendingId(product.id);
    setFailure(null);
    setDeletedNotice(null);
    setRetryTarget(null);
    try {
      await apiFetch<void>(`/api/products/${product.id}`, { method: "DELETE", body: JSON.stringify({ version: product.version }) });
      setDeletedNotice(`${product.sku} was deleted.`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.body.error.code === "VERSION_CONFLICT") {
        setFailure(`${product.sku} changed since this list was loaded, so nothing was deleted. The list now shows the latest version — review it and delete again.`);
        router.refresh();
      } else if (error instanceof ApiClientError && error.status === 404) {
        setFailure(`${product.sku} no longer exists. The list has been refreshed.`);
        router.refresh();
      } else {
        setFailure(error instanceof ApiClientError ? error.body.error.message : "An unexpected error occurred");
        setRetryTarget(product);
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Form action="/products" className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="product-search">Search products</Label>
          <Input id="product-search" name="search" type="search" defaultValue={search} placeholder="Name or SKU" autoComplete="off" />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {search ? (
          <Button asChild variant="ghost">
            <Link href="/products">Clear</Link>
          </Button>
        ) : null}
      </Form>

      {deletedNotice ? (
        <Alert role="status">
          <AlertDescription>{deletedNotice}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>Delete failed</AlertTitle>
          <AlertDescription>
            <p>{failure}</p>
            {retryTarget ? (
              <Button type="button" variant="outline" size="sm" disabled={pendingId !== null} onClick={() => void confirmDelete(retryTarget)}>
                Try again
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {pagination.total === 0 ? (
        <div className="border-border bg-card text-card-foreground rounded-xl border p-6">
          {search ? (
            <>
              <p className="font-medium">No products match “{search}”.</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Search looks at the product name and SKU.{" "}
                <Link className="text-foreground underline underline-offset-4" href="/products">
                  Clear the search
                </Link>{" "}
                to see every product.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No products yet.</p>
              <p className="text-muted-foreground mt-1 text-sm">Add your first product to start pricing and invoicing.</p>
              <Button asChild className="mt-4">
                <Link href="/products/new">Add a product</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
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
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((product) => {
                const isPending = pendingId === product.id;
                return (
                  <TableRow key={product.id} aria-busy={isPending}>
                    <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                    <TableCell>
                      <span className="font-medium">{product.name}</span>
                      {product.description ? (
                        <span className="text-muted-foreground block max-w-md text-xs">{product.description}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(product.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{product.quantityOnHand}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/products/${product.id}/edit`} aria-label={`Edit ${product.sku}`}>
                            Edit
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" disabled={pendingId !== null} aria-label={`Delete ${product.sku}`}>
                              {isPending ? "Deleting…" : "Delete"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {product.sku}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The product disappears from this list and its SKU stays reserved. Existing invoice lines keep their saved snapshot.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className={buttonVariants({ variant: "destructive" })}
                                disabled={pendingId !== null}
                                onClick={() => void confirmDelete(product)}
                              >
                                Delete product
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination pagination={pagination} basePath="/products" query={{ search }} />
        </>
      )}
    </div>
  );
}
