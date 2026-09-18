import type { Metadata } from "next";
import { SwaggerViewer } from "@/components/swagger-viewer";
import { OPENAPI_SPEC_PATH } from "@/lib/openapi";

export const metadata: Metadata = {
  title: "API documentation",
  description: "The OpenAPI 3.1 specification of the StockFlow API, rendered by a locally installed Swagger UI.",
};

/**
 * Standalone developer surface. It sits outside the `(dashboard)` shell, requires no session and is
 * absent from the client navigation on purpose: the people who use the app to bill customers are not
 * the maintainers of its API, so developer documentation must not appear inside the client screens.
 * The only entry point is the URL documented in the README (and the spec itself, at
 * `OPENAPI_SPEC_PATH`).
 */
export default function ApiDocumentationPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">StockFlow API</h1>
        <p className="text-muted-foreground text-sm">
          The specification is machine-readable at <code className="font-mono">{OPENAPI_SPEC_PATH}</code> and everything
          below is rendered locally from the installed <code className="font-mono">swagger-ui-dist</code> package: no CDN, no
          external validator and no session required.
        </p>
      </div>
      <SwaggerViewer specUrl={OPENAPI_SPEC_PATH} />
    </main>
  );
}
