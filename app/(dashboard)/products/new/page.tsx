import type { Metadata } from "next";
import { ProductForm } from "@/components/product-form";
import { requirePageUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "New product",
};

/** Create screen: the page checks the session itself before rendering an owner-scoped form. */
export default async function NewProductPage() {
  await requirePageUser();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <p className="text-muted-foreground text-sm">The SKU has to be unique in your workspace; prices are stored as integer cents.</p>
      </div>
      <ProductForm mode="create" />
    </div>
  );
}
