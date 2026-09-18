import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceActions } from "@/components/invoice-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageUser } from "@/lib/auth/session";
import { AppError } from "@/lib/http";
import { formatMoney } from "@/lib/money";
import { getInvoice } from "@/lib/services/invoices";
import type { InvoiceStatus } from "@/lib/types";
import { domainIdSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = {
  title: "Invoice",
};

type InvoiceDetailPageProps = { params: Promise<{ id: string }> };

/** Lifecycle labels and colours, kept next to the server-rendered detail (the list has its own). */
const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANTS: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  ISSUED: "default",
  PAID: "outline",
  CANCELLED: "destructive",
};

/** What the current state means for stock and for what can happen next. */
const STATUS_NOTES: Record<InvoiceStatus, string> = {
  DRAFT: "A draft reserves no stock. Issue it to deduct every line, or cancel it to close it without any stock effect.",
  ISSUED: "Issued: every line was deducted from stock and the lines are frozen. Cancel it to restore that stock once, or mark it paid.",
  PAID: "Paid: the invoice is final and its deducted stock is not restored.",
  CANCELLED: "Cancelled: the invoice is final. Stock deducted at issue, if any, has already been restored.",
};

/** Basis points as a percentage label without float noise: 1100 -> "11%", 1105 -> "11.05%". */
function taxRateLabel(taxRateBps: number): string {
  const whole = Math.trunc(taxRateBps / 100);
  const fraction = String(taxRateBps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}%` : `${whole}%`;
}

/**
 * Owner-scoped invoice detail. The session is checked here, the path segment is validated before it
 * can reach the uuid column, and an unknown, unowned or deleted invoice is "not found" without
 * revealing which of those it was. Lines come from the invoice's own snapshots, so later product
 * changes never rewrite what was invoiced.
 */
export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const user = await requirePageUser();
  const { id } = await params;

  const parsedId = domainIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  let invoice;
  try {
    invoice = await getInvoice(user.id, parsedId.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{invoice.invoiceNumber}</h1>
            <Badge variant={STATUS_VARIANTS[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {invoice.customerName} · issued {invoice.issueDate} · due {invoice.dueDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === "DRAFT" ? (
            <Button asChild variant="outline">
              <Link href={`/invoices/${invoice.id}/edit`}>Edit draft lines</Link>
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <Link href="/invoices">Back to invoices</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm">{STATUS_NOTES[invoice.status]}</p>
          {invoice.notes ? <p className="text-muted-foreground text-sm">Notes: {invoice.notes}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Product</TableHead>
                <TableHead scope="col" className="text-right">
                  Unit price
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Quantity
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Line total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right">
                  Subtotal
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(invoice.subtotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right">
                  Tax ({taxRateLabel(invoice.taxRateBps)})
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(invoice.taxAmount)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMoney(invoice.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-muted-foreground text-sm">
            Product names, unit prices and the tax rate are the snapshots stored with this invoice ({taxRateLabel(invoice.taxRateBps)} tax),
            so renaming, repricing or deleting a product does not change what was invoiced.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceActions invoice={invoice} />
        </CardContent>
      </Card>
    </div>
  );
}
