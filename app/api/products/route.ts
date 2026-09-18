import type { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin, dataResponse, handleRoute, readJson } from "@/lib/http";
import { createProduct, listProducts } from "@/lib/services/products";
import type { Page, ProductDto } from "@/lib/types";
import { createProductSchema, productListSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/** List responses use the documented Page envelope directly: { data, pagination }. */
const pageResponse = (result: Page<ProductDto>): Response =>
  Response.json(result, { status: 200, headers: { "cache-control": "no-store" } });

/** Query strings are validated by the same strict schema as bodies, so unknown keys are 422. */
function readQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const result = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!result.success) throw result.error;
  return result.data;
}

/** GET /api/products -> paginated owner-scoped products with case-insensitive name/SKU search. */
export function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    const query = readQuery(request, productListSchema);
    return pageResponse(await listProducts(user.id, query));
  });
}

/** POST /api/products -> 201 created product; a taken SKU is a 409 field error. */
export function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const user = await requireAuth(request.headers);
    assertSameOrigin(request);
    const input = await readJson(request, createProductSchema);
    return dataResponse(await createProduct(user.id, input), 201);
  });
}
