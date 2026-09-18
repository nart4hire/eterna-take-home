import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductList } from "@/components/product-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/lib/auth/session";
import { listProducts } from "@/lib/services/products";
import { productListSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = {
  title: "Products",
};

type ProductsPageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

/** List URLs the page and its pagination links use; page 1 keeps the address short. */
function productsHref(search: string, page: number): string {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

/**
 * Owner-scoped product list. The page authorises itself before touching data, validates the two
 * documented query parameters with the API's own schema, and loads rows through the service rather
 * than an HTTP self-fetch. Unrelated query keys (for example `?created=1`) are ignored on purpose.
 */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await requirePageUser();
  const params = await searchParams;
  const created = params.created === "1";
  const updated = params.updated === "1";

  const parsed = productListSchema.safeParse({
    ...(typeof params.page === "string" ? { page: params.page } : {}),
    ...(typeof params.search === "string" ? { search: params.search } : {}),
  });

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground text-sm">Your catalogue: search, adjust prices and stock, delete what you no longer sell.</p>
      </div>
      <Button asChild>
        <Link href="/products/new">New product</Link>
      </Button>
    </div>
  );

  if (!parsed.success) {
    return (
      <div className="space-y-6">
        {header}
        <Alert variant="destructive">
          <AlertTitle>Those search parameters are not valid</AlertTitle>
          <AlertDescription>
            <p>The address asked for a page number or search term this list cannot use.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/products">Reset the list</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { page, search } = parsed.data;
  const products = await listProducts(user.id, parsed.data);

  // Deleting the last row of the last page leaves a stale ?page=: land on the last real page instead.
  if (products.pagination.totalPages > 0 && page > products.pagination.totalPages) {
    redirect(productsHref(search, products.pagination.totalPages));
  }

  return (
    <div className="space-y-6">
      {header}
      {created ? (
        <Alert role="status">
          <AlertDescription>Product created.</AlertDescription>
        </Alert>
      ) : null}
      {updated ? (
        <Alert role="status">
          <AlertDescription>Product saved.</AlertDescription>
        </Alert>
      ) : null}
      <ProductList page={products} search={search} />
    </div>
  );
}
