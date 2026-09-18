"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { parseMoney } from "@/lib/money";
import type { ProductDto } from "@/lib/types";

export type ProductFormProps = { mode: "create" } | { mode: "edit"; product: ProductDto };

type FieldErrors = Record<string, string[]>;
type DataEnvelope<T> = { data: T };
type FormValues = { sku: string; name: string; description: string; unitPrice: string; quantityOnHand: string };

const EMPTY_VALUES: FormValues = { sku: "", name: "", description: "", unitPrice: "", quantityOnHand: "" };

/** Cents back to the decimal string `parseMoney` accepts: integer arithmetic, never a float round-trip. */
function centsToInputValue(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** The edit form starts from the server DTO: no derived totals and no client-side guesses. */
function valuesFromProduct(product: ProductDto): FormValues {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description ?? "",
    unitPrice: centsToInputValue(product.unitPrice),
    quantityOnHand: String(product.quantityOnHand),
  };
}

/** First message for a field path, so inputs can render inline text through aria-describedby. */
function fieldMessage(fields: FieldErrors, path: string): string | undefined {
  return fields[path]?.[0];
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Turns the form strings into the documented payload: money through the shared cents helper and an
 * integer quantity. Only what cannot be sent at all is reported here — every other rule stays on the
 * server, which remains the single validator.
 */
function buildSubmitBody(values: FormValues, version: number | null): { body: Record<string, unknown> } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  let unitPrice: number | null = null;
  try {
    unitPrice = parseMoney(values.unitPrice.trim());
  } catch (error) {
    errors.unitPrice = [messageOf(error, "Expected a nonnegative decimal amount with up to two fraction digits")];
  }
  const quantityText = values.quantityOnHand.trim();
  const quantityIsWhole = /^\d+$/.test(quantityText);
  if (!quantityIsWhole) errors.quantityOnHand = ["Expected a whole number of items"];
  if (unitPrice === null || !quantityIsWhole) return { errors };

  const description = values.description.trim();
  return {
    body: {
      // The version travels with the edit payload so a stale form cannot overwrite newer stock.
      ...(version === null ? {} : { version }),
      sku: values.sku.trim(),
      name: values.name.trim(),
      description: description.length > 0 ? description : null,
      unitPrice,
      quantityOnHand: Number(quantityText),
    },
  };
}

/**
 * Create/edit product form. Saving posts the documented payload (decimal string -> integer cents,
 * version included) and leaves the page on success; a failure keeps every typed value on screen with
 * the server's field messages, and a lost version race reloads the saved product instead of looping.
 */
export function ProductForm(props: ProductFormProps) {
  const router = useRouter();
  const product = props.mode === "edit" ? props.product : null;
  const [values, setValues] = useState<FormValues>(() => (product ? valuesFromProduct(product) : EMPTY_VALUES));
  const [version, setVersion] = useState(product ? product.version : 0);
  const [pending, setPending] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [reloadFailed, setReloadFailed] = useState(false);

  const skuError = fieldMessage(fieldErrors, "sku");
  const nameError = fieldMessage(fieldErrors, "name");
  const descriptionError = fieldMessage(fieldErrors, "description");
  const priceError = fieldMessage(fieldErrors, "unitPrice");
  const quantityError = fieldMessage(fieldErrors, "quantityOnHand");
  const rootErrors = fieldErrors._root ?? [];

  function updateField(field: keyof FormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setValues((current) => ({ ...current, [field]: value }));
    };
  }

  /** Version-conflict recovery: load the saved product again and put it on screen for a fresh decision. */
  async function reloadLatest(): Promise<void> {
    if (!product) return;
    setReloadPending(true);
    setReloadFailed(false);
    try {
      const response = await apiFetch<DataEnvelope<ProductDto>>(`/api/products/${product.id}`);
      setValues(valuesFromProduct(response.data));
      setVersion(response.data.version);
      setFieldErrors({});
      setFailure(null);
      setNotice(`${response.data.sku} changed in another session, so saving stopped. The form now shows the latest saved values — review them and save again.`);
    } catch (error) {
      setReloadFailed(true);
      if (error instanceof ApiClientError && error.status === 404) {
        setNotice(null);
        setFailure("This product no longer exists. Return to the product list to continue.");
      } else {
        setFailure(error instanceof ApiClientError ? error.body.error.message : "An unexpected error occurred");
      }
    } finally {
      setReloadPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const built = buildSubmitBody(values, product ? version : null);
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
    setFieldErrors({});
    try {
      if (product) {
        await apiFetch<DataEnvelope<ProductDto>>(`/api/products/${product.id}`, { method: "PATCH", body: JSON.stringify(built.body) });
        router.push("/products?updated=1");
      } else {
        await apiFetch<DataEnvelope<ProductDto>>("/api/products", { method: "POST", body: JSON.stringify(built.body) });
        router.push("/products?created=1");
      }
      // Pending stays true: the button must not become clickable again while the page navigates.
    } catch (error) {
      setPending(false);
      if (!(error instanceof ApiClientError)) {
        setFailure("An unexpected error occurred");
        return;
      }
      const { code, message, fields } = error.body.error;
      setFieldErrors(fields ?? {});
      if (code === "VERSION_CONFLICT" && product) {
        await reloadLatest();
        return;
      }
      setFailure(message);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="sku">SKU</Label>
        <Input
          id="sku"
          name="sku"
          required
          autoComplete="off"
          value={values.sku}
          onChange={updateField("sku")}
          aria-invalid={skuError ? true : undefined}
          aria-describedby={skuError ? "sku-error" : "sku-hint"}
          disabled={pending}
        />
        {skuError ? (
          <p id="sku-error" className="text-destructive text-sm">
            {skuError}
          </p>
        ) : null}
        <p id="sku-hint" className="text-muted-foreground text-sm">
          Unique in your workspace; saved in upper case.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="off"
          value={values.name}
          onChange={updateField("name")}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "name-error" : undefined}
          disabled={pending}
        />
        {nameError ? (
          <p id="name-error" className="text-destructive text-sm">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          value={values.description}
          onChange={updateField("description")}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? "description-error" : "description-hint"}
          disabled={pending}
        />
        {descriptionError ? (
          <p id="description-error" className="text-destructive text-sm">
            {descriptionError}
          </p>
        ) : null}
        <p id="description-hint" className="text-muted-foreground text-sm">
          Optional, up to 2000 characters.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="unitPrice">Unit price</Label>
          <Input
            id="unitPrice"
            name="unitPrice"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={values.unitPrice}
            onChange={updateField("unitPrice")}
            aria-invalid={priceError ? true : undefined}
            aria-describedby={priceError ? "unitPrice-error" : "unitPrice-hint"}
            disabled={pending}
          />
          {priceError ? (
            <p id="unitPrice-error" className="text-destructive text-sm">
              {priceError}
            </p>
          ) : null}
          <p id="unitPrice-hint" className="text-muted-foreground text-sm">
            Decimal amount with up to two places; sent as integer cents.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantityOnHand">Quantity on hand</Label>
          <Input
            id="quantityOnHand"
            name="quantityOnHand"
            required
            inputMode="numeric"
            autoComplete="off"
            value={values.quantityOnHand}
            onChange={updateField("quantityOnHand")}
            aria-invalid={quantityError ? true : undefined}
            aria-describedby={quantityError ? "quantityOnHand-error" : "quantityOnHand-hint"}
            disabled={pending}
          />
          {quantityError ? (
            <p id="quantityOnHand-error" className="text-destructive text-sm">
              {quantityError}
            </p>
          ) : null}
          <p id="quantityOnHand-hint" className="text-muted-foreground text-sm">
            Whole units available in stock.
          </p>
        </div>
      </div>

      {product ? (
        <p className="text-muted-foreground text-sm">
          Loaded version {version}: saving sends this version, so a product changed elsewhere is reported instead of overwritten.
        </p>
      ) : null}

      {notice ? (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>{product ? "The product was not saved" : "The product was not created"}</AlertTitle>
          <AlertDescription>
            <p>{failure}</p>
            {rootErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
            {reloadFailed && product ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void reloadLatest()} disabled={reloadPending} aria-busy={reloadPending}>
                {reloadPending ? "Loading…" : "Load the latest values"}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Back to products</Link>
        </Button>
      </div>

    </form>
  );
}

