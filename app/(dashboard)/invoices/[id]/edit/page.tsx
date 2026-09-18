import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoice-form";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/lib/auth/session";
import { AppError } from "@/lib/http";
import { getInvoice } from "@/lib/services/invoices";
import type { InvoiceDetailDto } from "@/lib/types";
import { domainIdSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = {
  title: "Edit invoice",
};

type EditInvoicePageProps = { params: Promise<{ id: string }> };

/**
 * Owner-scoped draft editor.
 *
 * The session is checked here, the path segment is validated before it can reach the uuid column,
 * and an unknown or unowned invoice is "not found". The screen is draft-only: an issued, paid or
 * cancelled invoice has frozen lines, so the visitor is sent to the detail page, where the current
 * state and its stock effect are explained, instead of being shown a form that could never save.
 */
export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const user = await requirePageUser();
  const { id } = await params;

  const parsedId = domainIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  let invoice: InvoiceDetailDto;
  try {
    invoice = await getInvoice(user.id, parsedId.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  if (invoice.status !== "DRAFT") redirect(`/invoices/${invoice.id}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Edit {invoice.invoiceNumber}</h1>
          <p className="text-muted-foreground text-sm">
            {invoice.customerName} · draft version {invoice.version} · stock is not reserved until the invoice is issued
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href={`/invoices/${invoice.id}`}>Back to the invoice</Link>
        </Button>
      </div>
      <InvoiceForm mode="edit" invoice={invoice} />
    </div>
  );
}
