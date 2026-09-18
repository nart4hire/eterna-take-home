import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvoiceList } from "@/components/invoice-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/lib/auth/session";
import { listInvoices } from "@/lib/services/invoices";
import { invoiceListSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = {
  title: "Invoices",
};

type InvoicesPageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

/** List URLs the page and the shared pagination links use; page 1 and "all statuses" stay short. */
function invoicesHref(status: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

/**
 * Owner-scoped invoice list. The page authorises itself before touching data, validates the two
 * documented query parameters with the API's own schema, and loads rows through the service rather
 * than an HTTP self-fetch. `?status=` with an empty value means "all statuses" (the filter's default
 * option) and is normalised away, while an unknown status is still rejected as invalid input.
 */
export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const user = await requirePageUser();
  const params = await searchParams;
  const status = typeof params.status === "string" && params.status.length > 0 ? params.status : undefined;

  const parsed = invoiceListSchema.safeParse({
    ...(typeof params.page === "string" ? { page: params.page } : {}),
    ...(status ? { status } : {}),
  });

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground text-sm">
          Drafts reserve no stock. Issuing deducts every line; cancelling an issued invoice restores it once.
        </p>
      </div>
      <Button asChild>
        <Link href="/invoices/new">New invoice</Link>
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
            <p>The address asked for a page number or a status this list cannot use.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/invoices">Reset the list</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { page, status: filter } = parsed.data;

  // "All statuses" is the filter's default option, so an explicit empty ?status= is normalised away in the
  // address: the canonical all-statuses URL is /invoices, keeping ?page= only when it is past the first page.
  if (typeof params.status === "string" && params.status.length === 0) {
    redirect(invoicesHref(undefined, page));
  }

  const invoices = await listInvoices(user.id, parsed.data);

  // Cancelling or filtering the last row of the last page leaves a stale ?page=: land on the last real page.
  if (invoices.pagination.totalPages > 0 && page > invoices.pagination.totalPages) {
    redirect(invoicesHref(filter, invoices.pagination.totalPages));
  }

  return (
    <div className="space-y-6">
      {header}
      <InvoiceList page={invoices} status={filter} />
    </div>
  );
}
