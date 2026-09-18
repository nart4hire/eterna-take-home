"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ProductPicker } from "@/components/product-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { calculateTotals, formatMoney } from "@/lib/money";
import type { InvoiceDetailDto, MoneyTotals, ProductDto } from "@/lib/types";

export type InvoiceFormProps =
  | {
      mode: "create";
      /** Configured TAX_RATE_BPS, passed down so the preview uses the rate the server will store. */
      taxRateBps: number;
      /** UTC calendar date computed on the server, so the first render matches after hydration. */
      defaultIssueDate: string;
    }
  | { mode: "edit"; invoice: InvoiceDetailDto };

type FieldErrors = Record<string, string[]>;
type DataEnvelope<T> = { data: T };
type LineDraft = { productId: string; productName: string; unitPrice: number; quantity: string };
type MetadataValues = { customerName: string; issueDate: string; dueDate: string; notes: string };

/** First message for a field path, so inputs can render inline text through aria-describedby. */
function fieldMessage(fields: FieldErrors, path: string): string | undefined {
  return fields[path]?.[0];
}

/** Basis points as a percentage label without float noise: 1100 -> "11%", 1105 -> "11.05%". */
function taxRateLabel(taxRateBps: number): string {
  const whole = Math.trunc(taxRateBps / 100);
  const fraction = String(taxRateBps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}%` : `${whole}%`;
}

/** An existing draft line keeps its saved snapshot: name, price and quantity come from the server. */
function linesFromInvoice(invoice: InvoiceDetailDto): LineDraft[] {
  return invoice.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: String(item.quantity),
  }));
}

/**
 * The live preview runs through the server's own `calculateTotals`, so it cannot round differently
 * from the saved figures. A line that is still being typed makes the preview unavailable instead of
 * throwing, and the panel says what is missing.
 */
function previewOf(lines: readonly LineDraft[], taxRateBps: number): MoneyTotals | null {
  if (lines.length === 0) return null;
  if (lines.some((line) => !/^\d+$/.test(line.quantity))) return null;
  try {
    return calculateTotals(
      lines.map((line) => ({ unitPrice: line.unitPrice, quantity: Number(line.quantity) })),
      taxRateBps,
    );
  } catch {
    return null;
  }
}

/** Item-scoped errors are dropped whenever the line list changes, so no stale path lingers. */
function withoutItemErrors(fields: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(fields).filter(([path]) => !path.startsWith("items")));
}

type BuiltRequest = { body: Record<string, unknown> } | { errors: FieldErrors };

/**
 * Only what cannot be sent at all is pre-checked here — empty metadata, an empty line set and
 * quantities that are not whole numbers. Every business rule (real calendar dates, due on or after
 * issue, stock, duplicate products, arithmetic bounds) stays on the server, the single validator.
 *
 * Editing sends exactly `{ version, items }`, because that is all the item-replacement contract
 * accepts: customer, dates and notes are set when the draft is created.
 */
function buildRequest(input: {
  mode: "create" | "edit";
  version: number;
  metadata: MetadataValues;
  lines: readonly LineDraft[];
}): BuiltRequest {
  const errors: FieldErrors = {};
  input.lines.forEach((line, index) => {
    if (!/^\d+$/.test(line.quantity)) errors[`items.${index}.quantity`] = ["Enter a whole quantity of at least 1"];
  });
  if (input.lines.length === 0) errors.items = ["Add at least one product line"];

  if (input.mode === "edit") {
    if (Object.keys(errors).length > 0) return { errors };
    return { body: { version: input.version, items: input.lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })) } };
  }

  const customerName = input.metadata.customerName.trim();
  if (customerName.length === 0) errors.customerName = ["Enter the customer name"];
  if (input.metadata.issueDate.length === 0) errors.issueDate = ["Choose an issue date"];
  if (input.metadata.dueDate.length === 0) errors.dueDate = ["Choose a due date"];
  if (Object.keys(errors).length > 0) return { errors };

  const notes = input.metadata.notes.trim();
  return {
    body: {
      customerName,
      issueDate: input.metadata.issueDate,
      dueDate: input.metadata.dueDate,
      notes: notes.length > 0 ? notes : null,
      items: input.lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
    },
  };
}

/**
 * Create/edit screen for an invoice.
 *
 * Creation collects the customer, the dates and the lines, and shows live totals from the shared
 * money helper while the server remains authoritative on save. Editing replaces the whole line set
 * with the version that was loaded, so a draft changed elsewhere is reported (409) instead of being
 * silently overwritten: the form reloads the saved draft, or - when the draft is no longer a draft -
 * points at the invoice. Server field errors are rendered inline, a pending submission disables
 * every control, and failures keep the typed values with a retry.
 */
export function InvoiceForm(props: InvoiceFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const invoiceId = props.mode === "edit" ? props.invoice.id : null;
  const taxRateBps = props.mode === "edit" ? props.invoice.taxRateBps : props.taxRateBps;
  const initialMetadata: MetadataValues =
    props.mode === "edit"
      ? {
          customerName: props.invoice.customerName,
          issueDate: props.invoice.issueDate,
          dueDate: props.invoice.dueDate,
          notes: props.invoice.notes ?? "",
        }
      : { customerName: "", issueDate: props.defaultIssueDate, dueDate: props.defaultIssueDate, notes: "" };

  const [metadata, setMetadata] = useState<MetadataValues>(initialMetadata);
  const [lines, setLines] = useState<LineDraft[]>(() => (props.mode === "edit" ? linesFromInvoice(props.invoice) : []));
  const [version, setVersion] = useState(props.mode === "edit" ? props.invoice.version : 0);
  const [pending, setPending] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [reloadFailed, setReloadFailed] = useState(false);
  const [stale, setStale] = useState(false);
  /** True only for failures a plain re-submit can fix (transport/5xx), so the alert can offer a retry. */
  const [retryable, setRetryable] = useState(false);

  const preview = previewOf(lines, taxRateBps);
  const customerError = fieldMessage(fieldErrors, "customerName");
  const issueDateError = fieldMessage(fieldErrors, "issueDate");
  const dueDateError = fieldMessage(fieldErrors, "dueDate");
  const notesError = fieldMessage(fieldErrors, "notes");
  const itemsError = fieldMessage(fieldErrors, "items");
  const rootErrors = fieldErrors._root ?? [];

  function updateMetadataField(field: keyof MetadataValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setMetadata((current) => ({ ...current, [field]: value }));
    };
  }

  /** New lines take the current catalogue snapshot; the server applies the same rule on save. */
  function addProduct(product: ProductDto): void {
    setLines((current) =>
      current.some((line) => line.productId === product.id)
        ? current
        : [...current, { productId: product.id, productName: product.name, unitPrice: product.unitPrice, quantity: "1" }],
    );
    setFieldErrors(withoutItemErrors);
  }

  function updateQuantity(index: number, value: string): void {
    setLines((current) => current.map((line, position) => (position === index ? { ...line, quantity: value } : line)));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`items.${index}.quantity`];
      return next;
    });
  }

  /** Removing a line shifts every later index, so all item-scoped messages are dropped. */
  function removeLine(productId: string): void {
    setLines((current) => current.filter((line) => line.productId !== productId));
    setFieldErrors(withoutItemErrors);
  }

  function applyInvoice(next: InvoiceDetailDto): void {
    setMetadata({ customerName: next.customerName, issueDate: next.issueDate, dueDate: next.dueDate, notes: next.notes ?? "" });
    setLines(linesFromInvoice(next));
    setVersion(next.version);
    setFieldErrors({});
    setFailure(null);
    setStale(false);
  }

  /** Version-conflict recovery: load the saved draft and put it on screen for a fresh decision. */
  async function reloadLatest(): Promise<void> {
    if (invoiceId === null) return;
    setReloadPending(true);
    setReloadFailed(false);
    try {
      const response = await apiFetch<DataEnvelope<InvoiceDetailDto>>(`/api/invoices/${invoiceId}`);
      applyInvoice(response.data);
      setNotice("This draft changed in another session, so saving stopped. The form now shows the latest saved lines — review them and save again.");
    } catch (error) {
      setReloadFailed(true);
      if (error instanceof ApiClientError && error.status === 404) {
        setNotice(null);
        setStale(true);
        setFailure("This invoice no longer exists. Return to the invoice list to continue.");
      } else {
        setFailure(error instanceof ApiClientError ? error.body.error.message : "An unexpected error occurred");
      }
    } finally {
      setReloadPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const built = buildRequest({ mode: props.mode, version, metadata, lines });
    if ("errors" in built) {
      setFieldErrors(built.errors);
      setNotice(null);
      setFailure("Check the highlighted fields and try again.");
      return;
    }

    setPending(true);
    setFailure(null);
    setNotice(null);
    setReloadFailed(false);
    setStale(false);
    setRetryable(false);
    setFieldErrors({});
    try {
      if (invoiceId !== null) {
        await apiFetch<DataEnvelope<InvoiceDetailDto>>(`/api/invoices/${invoiceId}/items`, { method: "PUT", body: JSON.stringify(built.body) });
        router.push(`/invoices/${invoiceId}`);
      } else {
        const created = await apiFetch<DataEnvelope<InvoiceDetailDto>>("/api/invoices", { method: "POST", body: JSON.stringify(built.body) });
        router.push(`/invoices/${created.data.id}`);
      }
      // Pending stays true: the button must not become clickable again while the page navigates.
    } catch (error) {
      setPending(false);
      if (!(error instanceof ApiClientError)) {
        setRetryable(true);
        setFailure("The request could not reach the server, so nothing was saved. Check your connection and try again.");
        return;
      }
      const { code, message, fields } = error.body.error;
      setFieldErrors(fields ?? {});
      if (code === "VERSION_CONFLICT") {
        await reloadLatest();
        return;
      }
      if (code === "INVOICE_NOT_EDITABLE") {
        setStale(true);
        setFailure(message);
        return;
      }
      if (error.status === 404 && !fields) {
        setStale(true);
        setFailure("This invoice no longer exists. Return to the invoice list to continue.");
        return;
      }
      setRetryable(error.status >= 500);
      setFailure(message);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="space-y-8" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isEdit ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-muted-foreground text-sm">Customer</dt>
                  <dd className="font-medium">{metadata.customerName}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground text-sm">Tax rate</dt>
                  <dd>{taxRateLabel(taxRateBps)} — saved with the draft</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground text-sm">Issue date</dt>
                  <dd>{metadata.issueDate}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground text-sm">Due date</dt>
                  <dd>{metadata.dueDate}</dd>
                </div>
                {metadata.notes ? (
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="text-muted-foreground text-sm">Notes</dt>
                    <dd>{metadata.notes}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="text-muted-foreground text-sm">
                Only the lines of a draft can be edited: the customer, dates, notes and tax rate were fixed when the draft was created.
              </p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer</Label>
                <Input
                  id="customerName"
                  name="customerName"
                  required
                  autoComplete="off"
                  value={metadata.customerName}
                  onChange={updateMetadataField("customerName")}
                  aria-invalid={customerError ? true : undefined}
                  aria-describedby={customerError ? "customerName-error" : "customerName-hint"}
                  disabled={pending}
                />
                {customerError ? (
                  <p id="customerName-error" className="text-destructive text-sm">
                    {customerError}
                  </p>
                ) : null}
                <p id="customerName-hint" className="text-muted-foreground text-sm">
                  Up to 200 characters.
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="issueDate">Issue date</Label>
                  <Input
                    id="issueDate"
                    name="issueDate"
                    type="date"
                    required
                    value={metadata.issueDate}
                    onChange={updateMetadataField("issueDate")}
                    aria-invalid={issueDateError ? true : undefined}
                    aria-describedby={issueDateError ? "issueDate-error" : undefined}
                    disabled={pending}
                  />
                  {issueDateError ? (
                    <p id="issueDate-error" className="text-destructive text-sm">
                      {issueDateError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due date</Label>
                  <Input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    required
                    value={metadata.dueDate}
                    onChange={updateMetadataField("dueDate")}
                    aria-invalid={dueDateError ? true : undefined}
                    aria-describedby={dueDateError ? "dueDate-error" : undefined}
                    disabled={pending}
                  />
                  {dueDateError ? (
                    <p id="dueDate-error" className="text-destructive text-sm">
                      {dueDateError}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-sm">Must be on or after the issue date.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  value={metadata.notes}
                  onChange={updateMetadataField("notes")}
                  aria-invalid={notesError ? true : undefined}
                  aria-describedby={notesError ? "notes-error" : "notes-hint"}
                  disabled={pending}
                />
                {notesError ? (
                  <p id="notes-error" className="text-destructive text-sm">
                    {notesError}
                  </p>
                ) : null}
                <p id="notes-hint" className="text-muted-foreground text-sm">
                  Optional, up to 2000 characters.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProductPicker selectedProductIds={lines.map((line) => line.productId)} onSelect={addProduct} disabled={pending} />

          {isEdit ? (
            <p className="text-muted-foreground text-sm">
              Lines already on this draft keep the name and price saved with them; a newly added product takes the current catalogue values.
            </p>
          ) : null}

          {itemsError ? (
            <p className="text-destructive text-sm" role="alert">
              {itemsError}
            </p>
          ) : null}

          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">No lines yet. Add a product from the catalogue above — an invoice needs at least one.</p>
          ) : (
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
                  <TableHead scope="col" className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => {
                  const productError = fieldMessage(fieldErrors, `items.${index}.productId`);
                  const quantityError = fieldMessage(fieldErrors, `items.${index}.quantity`);
                  const lineTotal = preview?.lineTotals[index];
                  return (
                    <TableRow key={line.productId}>
                      <TableCell>
                        <span className="font-medium">{line.productName}</span>
                        {productError ? (
                          <p id={`items-${index}-productId-error`} className="text-destructive text-sm">
                            {productError} — remove this line or the draft cannot be saved.
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(line.unitPrice)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          id={`items-${index}-quantity`}
                          aria-label={`Quantity of ${line.productName}`}
                          inputMode="numeric"
                          autoComplete="off"
                          value={line.quantity}
                          onChange={(event) => updateQuantity(index, event.target.value)}
                          aria-invalid={quantityError ? true : undefined}
                          aria-describedby={quantityError ? `items-${index}-quantity-error` : undefined}
                          disabled={pending}
                          className="ml-auto w-24 text-right"
                        />
                        {quantityError ? (
                          <p id={`items-${index}-quantity-error`} className="text-destructive text-sm">
                            {quantityError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{lineTotal === undefined ? "—" : formatMoney(lineTotal)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => removeLine(line.productId)} aria-label={`Remove ${line.productName} from the invoice`}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end">
            <dl className="grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt>Subtotal</dt>
              <dd className="text-right tabular-nums">{preview ? formatMoney(preview.subtotal) : "—"}</dd>
              <dt>Tax ({taxRateLabel(taxRateBps)})</dt>
              <dd className="text-right tabular-nums">{preview ? formatMoney(preview.taxAmount) : "—"}</dd>
              <dt className="font-medium">Total</dt>
              <dd className="text-right font-medium tabular-nums">{preview ? formatMoney(preview.total) : "—"}</dd>
            </dl>
          </div>
          <p className="text-muted-foreground text-sm">
            {preview
              ? "Preview only: the server recomputes every total from its own snapshots when you save, and the invoice page shows those saved figures."
              : "Add at least one line and give every line a whole quantity of at least 1 to see the totals."}
          </p>
        </CardContent>
      </Card>

      {notice ? (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>{isEdit ? "The draft was not saved" : "The invoice was not created"}</AlertTitle>
          <AlertDescription>
            <p>{failure}</p>
            {rootErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
            {retryable ? (
              /* Inside the form, so a plain submit re-runs the same request with the typed values kept. */
              <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
                {pending ? "Retrying…" : "Try again"}
              </Button>
            ) : null}
            {stale ? (
              <Button asChild variant="outline" size="sm">
                <Link href={isEdit && invoiceId !== null ? `/invoices/${invoiceId}` : "/invoices"}>
                  {isEdit ? "Open the invoice" : "Open the invoice list"}
                </Link>
              </Button>
            ) : null}
            {reloadFailed && isEdit ? (
              <Button type="button" variant="outline" size="sm" disabled={reloadPending} aria-busy={reloadPending} onClick={() => void reloadLatest()}>
                {reloadPending ? "Loading…" : "Load the latest saved lines"}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : isEdit ? "Save draft lines" : "Create draft"}
        </Button>
        <Button asChild variant="outline">
          <Link href={isEdit && invoiceId !== null ? `/invoices/${invoiceId}` : "/invoices"}>{isEdit ? "Back to the invoice" : "Cancel"}</Link>
        </Button>
      </div>
    </form>
  );
}
