import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { requirePageUser } from "@/lib/auth/session";
import { AppError } from "@/lib/http";
import { getProduct } from "@/lib/services/products";
import type { ProductDto } from "@/lib/types";
import { domainIdSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = {
  title: "Edit product",
};

type EditProductPageProps = { params: Promise<{ id: string }> };

/**
 * Owner-scoped edit screen. The session is checked here, the path segment is validated before it can
 * reach the uuid column, and an unknown, unowned or deleted product is "not found" without revealing
 * which of those it was.
 */
export default async function EditProductPage({ params }: EditProductPageProps) {
  const user = await requirePageUser();
  const { id } = await params;

  const parsedId = domainIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  let product: ProductDto;
  try {
    product = await getProduct(user.id, parsedId.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit {product.sku}</h1>
        <p className="text-muted-foreground text-sm">{product.name}</p>
      </div>
      <ProductForm mode="edit" product={product} />
    </div>
  );
}
