"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import type { InvoiceDetailDto, InvoiceStatus } from "@/lib/types";

type TransitionTarget = "ISSUED" | "PAID" | "CANCELLED";

type InvoiceAction = {
  status: TransitionTarget;
  label: string;
  title: string;
  description: string;
  destructive: boolean;
};

/**
 * The legal edges of the lifecycle, mirrored from `assertTransition` for rendering only: the buttons
 * offered are exactly the transitions the service accepts, and the server still refuses everything
 * else with a 409. Terminal states therefore render no actions at all.
 */
const ACTIONS: Record<InvoiceStatus, readonly InvoiceAction[]> = {
  DRAFT: [
    {
      status: "ISSUED",
      label: "Issue invoice",
      title: "Issue this invoice?",
      description:
        "Issuing deducts every line from stock and freezes the lines. You can still cancel it afterwards, which restores that stock exactly once.",
      destructive: false,
    },
    {
      status: "CANCELLED",
      label: "Cancel draft",
      title: "Cancel this draft?",
      description: "A draft reserves no stock, so cancelling it only marks the invoice final. It can no longer be edited or issued.",
      destructive: true,
    },
  ],
  ISSUED: [
    {
      status: "PAID",
      label: "Mark as paid",
      title: "Mark this invoice as paid?",
      description: "Paid is terminal: the invoice can no longer be cancelled and its deducted stock is not restored.",
      destructive: false,
    },
    {
      status: "CANCELLED",
      label: "Cancel invoice",
      title: "Cancel this invoice?",
      description: "Cancelling restores the stock that issuing deducted, exactly once, and marks the invoice final.",
      destructive: true,
    },
  ],
  PAID: [],
  CANCELLED: [],
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const TERMINAL_NOTES: Record<"PAID" | "CANCELLED", string> = {
  PAID: "This invoice is paid, so it is final: there are no further actions and its deducted stock is not restored.",
  CANCELLED: "This invoice is cancelled, so it is final: any stock that issuing deducted has already been restored.",
};

export type InvoiceActionsProps = {
  /** The server-rendered detail: the version and status that every request is guarded by. */
  invoice: InvoiceDetailDto;
};

/**
 * Status actions for the invoice detail screen.
 *
 * Only legal transitions are offered, each behind a confirmation that spells out the stock
 * consequence. The version on screen travels with the request, a pending action disables every
 * control so nothing can be submitted twice, a 409 refreshes the route so the state that actually
 * won becomes visible, and a transport failure keeps a retry instead of an empty screen.
 */
export function InvoiceActions({ invoice }: InvoiceActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<InvoiceAction | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [lineFailure, setLineFailure] = useState(false);
  const [retry, setRetry] = useState<InvoiceAction | null>(null);
  const actions = ACTIONS[invoice.status];

  async function run(action: InvoiceAction): Promise<void> {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setNotice(null);
    setLineFailure(false);
    setRetry(null);
    try {
      const response = await apiFetch<{ data: InvoiceDetailDto }>(`/api/invoices/${invoice.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ version: invoice.version, status: action.status }),
      });
      setNotice(`${response.data.invoiceNumber} is now ${STATUS_LABELS[response.data.status]}.`);
      router.refresh();
    } catch (error) {
      if (!(error instanceof ApiClientError)) {
        setFailure("An unexpected error occurred");
      } else if (error.status === 0) {
        // Nothing is known about the server state, so the same action can be retried.
        setFailure(error.body.error.message);
        setRetry(action);
      } else {
        setFailure(error.body.error.message);
        if (error.status === 404 && error.body.error.fields) setLineFailure(true);
        if (error.status === 409 || error.status === 404) router.refresh();
      }
    } finally {
      setPending(false);
      setConfirming(null);
    }
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return (
      <Alert>
        <AlertTitle>{STATUS_LABELS[invoice.status]} invoice</AlertTitle>
        <AlertDescription>
          <p>{TERMINAL_NOTES[invoice.status]}</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      {notice ? (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>The invoice was not changed</AlertTitle>
          <AlertDescription>
            <p>{failure}</p>
            {lineFailure ? (
              <p className="mt-1">
                A line still references a product that is no longer selectable.{" "}
                <Link className="text-foreground underline underline-offset-4" href={`/invoices/${invoice.id}/edit`}>
                  Edit the draft lines
                </Link>{" "}
                and remove that line first.
              </p>
            ) : null}
            {retry ? (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void run(retry)}>
                Try again
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {actions.map((action) => (
          <Button
            key={action.status}
            type="button"
            variant={action.destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => {
              setConfirming(action);
              setFailure(null);
              setNotice(null);
              setRetry(null);
            }}
          >
            {action.label}
          </Button>
        ))}
        <p className="text-muted-foreground text-sm">
          Draft version {invoice.version}: every action sends this version, so a change made elsewhere is reported instead of overwritten.
        </p>
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it as it is</AlertDialogCancel>
            <AlertDialogAction
              className={confirming?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              disabled={pending}
              onClick={(event) => {
                // Keep the dialog open while the request runs so the pending state stays visible.
                event.preventDefault();
                if (confirming) void run(confirming);
              }}
            >
              {pending ? "Working…" : confirming?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
