"use client";

import Form from "next/form";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import type { InvoiceStatus, InvoiceSummaryDto, Page } from "@/lib/types";

export type InvoiceListProps = {
  /** The server-rendered page of owned invoice summaries: the list never re-fetches rows client-side. */
  page: Page<InvoiceSummaryDto>;
  /** The committed status filter, so the select always matches the rows on screen. */
  status: InvoiceStatus | undefined;
};

const STATUS_ORDER: readonly InvoiceStatus[] = ["DRAFT", "ISSUED", "PAID", "CANCELLED"];

/** Human labels for the lifecycle values; the API keeps its own uppercase union. */
const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/** Colour is a secondary cue: every badge keeps its text, and paid/cancelled stay distinguishable. */
function statusVariant(status: InvoiceStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "DRAFT") return "secondary";
  if (status === "CANCELLED") return "destructive";
  if (status === "PAID") return "outline";
  return "default";
}

/**
 * Invoice list with URL-driven status filtering and pagination.
 *
 * Rows arrive as serializable DTOs from the server page. The filter is a GET form, so it works
 * before hydration and the resulting address (`/invoices?status=ISSUED`) is shareable; paging keeps
 * the filter through the shared `Pagination` component and drops it when the value is empty.
 */
export function InvoiceList({ page, status }: InvoiceListProps) {
  const { data, pagination } = page;

  return (
    <div className="space-y-6">
      <Form action="/invoices" className="flex flex-wrap items-end gap-2">
        <div className="space-y-2">
          <Label htmlFor="invoice-status-filter">Status</Label>
          <select
            id="invoice-status-filter"
            name="status"
            defaultValue={status ?? ""}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-40 rounded-md border px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] md:text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {status ? (
          <Button asChild variant="ghost">
            <Link href="/invoices">Clear</Link>
          </Button>
        ) : null}
      </Form>

      {pagination.total === 0 ? (
        <div className="border-border bg-card text-card-foreground rounded-xl border p-6">
          {status ? (
            <>
              <p className="font-medium">No {STATUS_LABELS[status].toLowerCase()} invoices.</p>
              <p className="text-muted-foreground mt-1 text-sm">
                <Link className="text-foreground underline underline-offset-4" href="/invoices">
                  Clear the filter
                </Link>{" "}
                to see every invoice.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No invoices yet.</p>
              <p className="text-muted-foreground mt-1 text-sm">Create a draft, check the totals and issue it when the customer is happy.</p>
              <Button asChild className="mt-4">
                <Link href="/invoices/new">New invoice</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Invoice</TableHead>
                <TableHead scope="col">Customer</TableHead>
                <TableHead scope="col">Issued</TableHead>
                <TableHead scope="col">Due</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">
                  Total
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                  <TableCell className="font-medium">{invoice.customerName}</TableCell>
                  <TableCell>{invoice.issueDate}</TableCell>
                  <TableCell>{invoice.dueDate}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(invoice.status)}>{STATUS_LABELS[invoice.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(invoice.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/invoices/${invoice.id}`} aria-label={`View ${invoice.invoiceNumber}`}>
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination pagination={pagination} basePath="/invoices" query={{ status }} />
        </>
      )}
    </div>
  );
}

