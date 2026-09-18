import type { Metadata } from "next";
import { InvoiceForm } from "@/components/invoice-form";
import { requirePageUser } from "@/lib/auth/session";
import { readEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "New invoice",
};

/** Today as a UTC calendar date, so the server render and the hydrated client agree on the default. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create screen: the page checks the session itself and reads the configured tax rate on the server,
 * so the client form can preview totals with the same rate the service will store on the draft.
 */
export default async function NewInvoicePage() {
  await requirePageUser();
  const { taxRateBps } = readEnv(process.env);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>
        <p className="text-muted-foreground text-sm">
          Add products and quantities, check the preview, then save. Saving stores a draft; stock is only deducted when you issue it.
        </p>
      </div>
      <InvoiceForm mode="create" taxRateBps={taxRateBps} defaultIssueDate={today()} />
    </div>
  );
}
