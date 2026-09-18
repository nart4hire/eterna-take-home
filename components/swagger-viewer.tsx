"use client";

import { useEffect, useRef, useState } from "react";
import "swagger-ui-dist/swagger-ui.css";

/** Options this view uses. */
type SwaggerUIOptions = {
  url: string;
  domNode: HTMLElement;
  deepLinking: boolean;
  docExpansion: "list" | "full" | "none";
  defaultModelsExpandDepth: number;
  tryItOutEnabled: boolean;
};

type SwaggerUIBundleFactory = (options: SwaggerUIOptions) => unknown;

/**
 * Swagger UI, rendered from the locally installed `swagger-ui-dist` package. The bundle is imported
 * lazily inside the effect so the library only downloads on this page, and the specification is
 * fetched from our own origin with the caller's cookies: no CDN, no external validator and no
 * network dependency beyond the application itself.
 *
 * `swagger-ui-dist` declares only its package root (which pulls in `@scarf/scarf` telemetry and Node
 * built-ins), not this pre-bundled browser file, so the import is intentionally untyped and the one
 * shape used here is declared above.
 */
export function SwaggerViewer({ specUrl }: { specUrl: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    let active = true;

    // @ts-expect-error -- TS7016: the vendored browser bundle ships no declaration file.
    void import("swagger-ui-dist/swagger-ui-bundle.js")
      .then((bundle: { default: SwaggerUIBundleFactory }) => {
        if (!active) return;
        bundle.default({ url: specUrl, domNode: target, deepLinking: true, docExpansion: "list", defaultModelsExpandDepth: 1, tryItOutEnabled: true });
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      // React re-runs effects in development; clearing first keeps a single viewer instance.
      target.replaceChildren();
    };
  }, [specUrl]);

  return (
    <section aria-label="OpenAPI specification" className="mt-6">
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          The API viewer could not be loaded. The specification itself is still available at{" "}
          <code className="font-mono">{specUrl}</code>.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          Loading the API viewer…
        </p>
      )}
      <div id="swagger-ui" ref={container} />
    </section>
  );
}
