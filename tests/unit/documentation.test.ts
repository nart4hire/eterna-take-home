import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GET as getOpenApiDocument } from "@/app/api/openapi.json/route";
import { ERROR_CODES, OPENAPI_SPEC_PATH, SESSION_COOKIE_NAMES, openApiDocument } from "@/lib/openapi";
import {
  createInvoiceSchema,
  createProductSchema,
  deleteProductSchema,
  emptyBodySchema,
  invoiceListSchema,
  loginSchema,
  productListSchema,
  registerSchema,
  replaceInvoiceItemsSchema,
  transitionInvoiceSchema,
  updateProductSchema,
} from "@/lib/validation/schemas";

const root = path.resolve(__dirname, "../..");

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" ? (value as JsonRecord) : {});

const document = openApiDocument as unknown as { paths: Record<string, unknown> };

/** Follows a local `$ref` chain; an external reference is a documentation defect, not a shortcut. */
function deref(node: unknown): JsonRecord {
  const seen = new Set<unknown>();
  let current = asRecord(node);
  while (typeof current.$ref === "string") {
    const ref = current.$ref;
    if (!ref.startsWith("#/")) throw new Error(`External $ref is not allowed: ${ref}`);
    if (seen.has(current)) throw new Error(`Circular $ref chain at ${ref}`);
    seen.add(current);
    current = asRecord(ref.slice(2).split("/").reduce<unknown>((target, segment) => asRecord(target)[segment], openApiDocument));
  }
  return current;
}

/** Comparison form: documentation adds prose (`description`); everything else must match. */
const comparable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([key]) => key !== "$schema" && key !== "description")
        .map(([key, entry]) => [key, comparable(entry)]),
    );
  }
  return value;
};

const zodSchemaOf = (schema: z.ZodType): JsonRecord => z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" }) as JsonRecord;

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

/** Every documented operation as `[METHOD, /path, operation]`. */
function operations(): [string, string, JsonRecord][] {
  return Object.entries(document.paths).flatMap(([specPath, item]) =>
    Object.entries(asRecord(item))
      .filter(([entry]) => (HTTP_METHODS as readonly string[]).includes(entry))
      .map(([method, operation]) => [method.toUpperCase(), specPath, asRecord(operation)] as [string, string, JsonRecord]),
  );
}

const operationKey = (entry: [string, string, JsonRecord]): string => `${entry[0]} ${entry[1]}`;

/** The single response object documented under one status, with its `$ref` resolved. */
function responseOf(operation: JsonRecord, status: string): JsonRecord {
  return deref(asRecord(operation.responses)[status]);
}

/** Error codes documented under one response, read from the envelope's `code` enum. */
function documentedCodes(operation: JsonRecord, status: string): string[] {
  const schema = asRecord(asRecord(asRecord(responseOf(operation, status).content)["application/json"]).schema);
  const code = asRecord(asRecord(asRecord(schema.properties).error).properties).code;
  return (asRecord(code).enum as string[] | undefined) ?? [];
}

/** Every route file the application serves, in the same shape as an OpenAPI path. */
function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [full] : [];
  });
}

function specPathOf(file: string): string {
  const relative = path.relative(path.join(root, "app"), path.dirname(file));
  const segments = relative.split(path.sep).map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"));
  return `/${segments.join("/")}`;
}

function implementedMethods(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/^export (?:async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm)].map((match) => match[1]);
}


describe("N5: OpenAPI 3.1 specification", () => {
  it("documents exactly the implemented route handlers", () => {
    const implemented = new Set<string>();
    for (const file of routeFiles(path.join(root, "app", "api"))) {
      for (const method of implementedMethods(file)) implemented.add(`${method} ${specPathOf(file)}`);
    }
    expect([...new Set(operations().map(operationKey))].sort()).toEqual([...implemented].sort());
    expect(implemented.size).toBeGreaterThanOrEqual(15);
    expect(OPENAPI_SPEC_PATH).toBe(specPathOf(path.join(root, "app", "api", "openapi.json", "route.ts")));
  });

  it("validates as OpenAPI 3.1 with a local validator and no external reference", async () => {
    const clone = JSON.parse(JSON.stringify(openApiDocument)) as Parameters<typeof SwaggerParser.validate>[0];
    const validated = (await SwaggerParser.validate(clone)) as { openapi?: string; info?: { title?: string } };
    expect(validated.openapi).toBe("3.1.0");
    expect(validated.info?.title).toBe("StockFlow API");
    // The schemas use the OAS 3.1 default dialect, so the optional field stays absent: Swagger UI
    // warns "Values different from the default one are currently not supported" for any other value.
    expect(openApiDocument.jsonSchemaDialect).toBeUndefined();
    expect(JSON.stringify(openApiDocument)).not.toContain("jsonSchemaDialect");
    expect(JSON.stringify(openApiDocument).match(/"\$ref":"(?!#\/)[^"]+"/g)).toBeNull();
  });

  it("documents request bodies with the very schemas the handlers validate them with", () => {
    const bodies: Record<string, z.ZodType> = {
      "POST /api/auth/register": registerSchema,
      "POST /api/auth/login": loginSchema,
      "POST /api/auth/logout": emptyBodySchema,
      "POST /api/products": createProductSchema,
      "PATCH /api/products/{id}": updateProductSchema,
      "DELETE /api/products/{id}": deleteProductSchema,
      "POST /api/invoices": createInvoiceSchema,
      "PUT /api/invoices/{id}/items": replaceInvoiceItemsSchema,
      "PATCH /api/invoices/{id}/status": transitionInvoiceSchema,
    };
    const withBody = operations()
      .filter(([, , operation]) => operation.requestBody !== undefined)
      .map(operationKey)
      .sort();
    expect(withBody).toEqual(Object.keys(bodies).sort());

    for (const [key, schema] of Object.entries(bodies)) {
      const [method, specPath] = key.split(" ");
      const operation = asRecord(asRecord(document.paths[specPath])[method.toLowerCase()]);
      const body = deref(operation.requestBody);
      expect(body.required, key).toBe(true);
      const documented = asRecord(asRecord(body.content)["application/json"]).schema;
      expect(comparable(deref(documented)), key).toEqual(comparable(zodSchemaOf(schema)));
    }
  });

  it("documents the query parameters that parse the query string", () => {
    const queries: Record<string, { schema: z.ZodType; names: string[] }> = {
      "GET /api/products": { schema: productListSchema, names: ["page", "pageSize", "search"] },
      "GET /api/invoices": { schema: invoiceListSchema, names: ["page", "pageSize", "status"] },
    };
    for (const [key, { schema, names }] of Object.entries(queries)) {
      const [method, specPath] = key.split(" ");
      const operation = asRecord(asRecord(document.paths[specPath])[method.toLowerCase()]);
      const parameters = (operation.parameters as unknown[]).map(deref);
      expect(parameters.map((parameter) => parameter.name), key).toEqual(names);
      const derived = asRecord(zodSchemaOf(schema).properties);
      for (const parameter of parameters) {
        expect(parameter.in, key).toBe("query");
        expect(parameter.required, key).toBe(false);
        expect(comparable(parameter.schema), `${key} ${String(parameter.name)}`).toEqual(comparable(derived[String(parameter.name)]));
      }
    }
  });

  it("pins every documented status and error code to what the handler can answer", () => {
    const internal = ["INTERNAL_ERROR"];
    const mutations = ["INVALID_JSON", "ORIGIN_REJECTED", "VALIDATION_ERROR", ...internal];
    const expected: Record<string, Record<string, string[]>> = {
      "POST /api/auth/register": { "201": [], "400": ["INVALID_JSON"], "403": ["ORIGIN_REJECTED"], "409": ["REGISTRATION_FAILED"], "422": ["VALIDATION_ERROR"], "429": ["RATE_LIMITED"], "500": internal },
      "POST /api/auth/login": { "200": [], "400": ["INVALID_JSON"], "401": ["INVALID_CREDENTIALS"], "403": ["ORIGIN_REJECTED"], "422": ["VALIDATION_ERROR"], "429": ["RATE_LIMITED"], "500": internal },
      "POST /api/auth/logout": { "204": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "422": ["VALIDATION_ERROR"], "500": internal },
      "GET /api/auth/session": { "200": [], "401": ["UNAUTHORIZED"], "500": internal },
      "GET /api/products": { "200": [], "401": ["UNAUTHORIZED"], "422": ["VALIDATION_ERROR"], "500": internal },
      "POST /api/products": { "201": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "409": ["DUPLICATE_SKU"], "422": ["VALIDATION_ERROR"], "500": internal },
      "GET /api/products/{id}": { "200": [], "401": ["UNAUTHORIZED"], "404": ["NOT_FOUND"], "422": ["VALIDATION_ERROR"], "500": internal },
      "PATCH /api/products/{id}": { "200": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "404": ["NOT_FOUND"], "409": ["DUPLICATE_SKU", "TRANSACTION_CONFLICT", "VERSION_CONFLICT"], "422": ["VALIDATION_ERROR"], "500": internal },
      "DELETE /api/products/{id}": { "204": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "404": ["NOT_FOUND"], "409": ["TRANSACTION_CONFLICT", "VERSION_CONFLICT"], "422": ["VALIDATION_ERROR"], "500": internal },
      "GET /api/invoices": { "200": [], "401": ["UNAUTHORIZED"], "422": ["VALIDATION_ERROR"], "500": internal },
      "POST /api/invoices": { "201": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "404": ["NOT_FOUND"], "409": ["INSUFFICIENT_STOCK", "TRANSACTION_CONFLICT"], "422": ["ARITHMETIC_BOUNDS", "VALIDATION_ERROR"], "500": internal },
      "GET /api/invoices/{id}": { "200": [], "401": ["UNAUTHORIZED"], "404": ["NOT_FOUND"], "422": ["VALIDATION_ERROR"], "500": internal },
      "PUT /api/invoices/{id}/items": { "200": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "404": ["NOT_FOUND"], "409": ["INSUFFICIENT_STOCK", "INVOICE_NOT_EDITABLE", "TRANSACTION_CONFLICT", "VERSION_CONFLICT"], "422": ["ARITHMETIC_BOUNDS", "VALIDATION_ERROR"], "500": internal },
      "PATCH /api/invoices/{id}/status": { "200": [], "400": ["INVALID_JSON"], "401": ["UNAUTHORIZED"], "403": ["ORIGIN_REJECTED"], "404": ["NOT_FOUND"], "409": ["INSUFFICIENT_STOCK", "INVOICE_NOT_EDITABLE", "STOCK_OVERFLOW", "TRANSACTION_CONFLICT", "VERSION_CONFLICT"], "422": ["VALIDATION_ERROR"], "500": internal },
      "GET /api/openapi.json": { "200": [] },
    };

    // Every documented operation is pinned, and the helper lists above can only name real codes.
    expect(Object.keys(expected).sort()).toEqual(operations().map(operationKey).sort());
    for (const code of mutations) expect(ERROR_CODES).toContain(code);

    for (const [method, specPath, operation] of operations()) {
      const key = `${method} ${specPath}`;
      const statuses = expected[key];
      expect(Object.keys(asRecord(operation.responses)).sort(), key).toEqual(Object.keys(statuses).sort());
      for (const [status, codes] of Object.entries(statuses)) {
        expect(documentedCodes(operation, status).sort(), `${key} ${status}`).toEqual([...codes].sort());
        const response = responseOf(operation, status);
        if (!status.startsWith("2")) continue;
        if (status === "204") {
          expect(response.content).toBeUndefined();
          continue;
        }
        const schema = deref(asRecord(asRecord(response.content)["application/json"]).schema);
        // Success payloads are the flat Page envelope or `{ data: ... }`; the specification's own
        // document schema is deliberately loose and has no properties.
        if (schema.properties) expect(Object.keys(schema.properties as JsonRecord), key).toContain("data");
      }
    }
  });

  it("requires the session cookie exactly where the handlers authenticate", () => {
    const PROTECTED = new Set([
      "POST /api/auth/logout",
      "GET /api/auth/session",
      "GET /api/products",
      "POST /api/products",
      "GET /api/products/{id}",
      "PATCH /api/products/{id}",
      "DELETE /api/products/{id}",
      "GET /api/invoices",
      "POST /api/invoices",
      "GET /api/invoices/{id}",
      "PUT /api/invoices/{id}/items",
      "PATCH /api/invoices/{id}/status",
    ]);
    const PUBLIC = new Set(["POST /api/auth/register", "POST /api/auth/login", "GET /api/openapi.json"]);
    expect([...PROTECTED, ...PUBLIC].sort()).toEqual(operations().map(operationKey).sort());

    for (const [method, specPath, operation] of operations()) {
      const key = `${method} ${specPath}`;
      expect(operation.security, key).toEqual(PROTECTED.has(key) ? [{ sessionCookie: [] }] : []);
    }

    const scheme = asRecord(asRecord(asRecord(openApiDocument.components).securitySchemes).sessionCookie);
    expect(scheme).toMatchObject({ type: "apiKey", in: "cookie", name: SESSION_COOKIE_NAMES[0] });
    for (const cookieName of SESSION_COOKIE_NAMES) expect(String(scheme.description)).toContain(cookieName);
  });

  it("serves the validated document from a local, uncached route handler", async () => {
    const response = getOpenApiDocument();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(openApiDocument)) as object);
  });

  it("documents every error code the request path can produce, at the status that produces it", () => {
    const thrown = new Map<string, Set<string>>();
    const sources = [...sourceFiles(path.join(root, "lib")), ...sourceFiles(path.join(root, "app", "api"))];
    expect(sources.length).toBeGreaterThan(15);
    for (const file of sources) {
      for (const match of readFileSync(file, "utf8").matchAll(/new AppError\((\d{3}), "([A-Z_]+)"/g)) {
        const statuses = thrown.get(match[2]) ?? new Set<string>();
        statuses.add(match[1]);
        thrown.set(match[2], statuses);
      }
    }

    // `errorResponse` replaces every 5xx `AppError` with a sanitized 500 `INTERNAL_ERROR` (so
    // `CONFIGURATION_ERROR` never reaches a client), and `INTERNAL_ERROR` is produced by that
    // fallback. `INVALID_MONEY` belongs to `parseMoney`, a client-form helper: no request path parses
    // decimal money, because the API takes integer cents.
    const requestPath = new Set(["INTERNAL_ERROR"]);
    for (const [code, statuses] of thrown) {
      if (code === "INVALID_MONEY") continue;
      if ([...statuses].some((status) => Number(status) < 500)) requestPath.add(code);
    }
    expect([...requestPath].sort()).toEqual([...ERROR_CODES].sort());

    const documented = new Map<string, Set<string>>();
    for (const [, , operation] of operations()) {
      for (const status of Object.keys(asRecord(operation.responses))) {
        for (const code of documentedCodes(operation, status)) {
          const statuses = documented.get(code) ?? new Set<string>();
          statuses.add(status);
          documented.set(code, statuses);
        }
      }
    }
    for (const [code, statuses] of thrown) {
      if (!requestPath.has(code)) continue;
      for (const status of statuses) {
        if (Number(status) >= 500) continue;
        expect([...(documented.get(code) ?? [])], `${code} at ${status}`).toContain(status);
      }
    }
    // Every documented code is thrown somewhere, so the specification has no phantom codes.
    expect([...documented.keys()].sort()).toEqual([...ERROR_CODES].sort());
  });


});

describe("N5, AMEND-T08-1: the client application exposes no developer documentation", () => {
  it("renders the viewer standalone, without the dashboard shell or its session guard", () => {
    const page = readFileSync(path.join(root, "app", "docs", "page.tsx"), "utf8");
    expect(page).toContain("SwaggerViewer");
    expect(page).toContain("OPENAPI_SPEC_PATH");
    // No dashboard-shell dependency, no borrowed session guard and no layout entry.
    for (const forbidden of ['"@/lib/auth/session"', '"@/components/nav-link"', '"@/components/logout-button"', '"@/app/(dashboard)']) {
      expect(page, forbidden).not.toContain(forbidden);
    }

    const viewer = readFileSync(path.join(root, "components", "swagger-viewer.tsx"), "utf8");
    expect(viewer.trimStart().startsWith('"use client"')).toBe(true);
    expect(viewer).toContain('import("swagger-ui-dist/swagger-ui-bundle.js")');
    expect(viewer).toContain("swagger-ui-dist/swagger-ui.css");
    // No CDN, no remote validator, and not the Node-only package root (telemetry plus `node:fs`).
    expect(viewer).not.toMatch(/https?:\/\//);
    expect(viewer).not.toMatch(/["']swagger-ui-dist["']/);
  });

  it("keeps every client screen free of documentation links and of the specification itself", () => {
    const separator = path.sep;
    const clientFiles = [
      ...sourceFiles(path.join(root, "app")).filter((file) => !file.includes(`${separator}app${separator}api${separator}`) && !file.includes(`${separator}app${separator}docs${separator}`)),
      ...sourceFiles(path.join(root, "components")).filter((file) => !file.endsWith("swagger-viewer.tsx")),
    ];
    expect(clientFiles.length).toBeGreaterThan(15);
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/["'`]\/docs/);
      expect(source, file).not.toMatch(/openapi/i);
    }

    // Only the route handler and the standalone page may pull in the specification module.
    const importers = [...sourceFiles(path.join(root, "app")), ...sourceFiles(path.join(root, "components"))]
      .filter((file) => readFileSync(file, "utf8").includes('from "@/lib/openapi"'))
      .map((file) => path.relative(root, file))
      .sort();
    expect(importers).toEqual(["app/api/openapi.json/route.ts", "app/docs/page.tsx"]);
  });
});

describe("N1, N5: the README documents the delivered surface", () => {
  it("names the standalone documentation URL, both spec locations and the real workflow", () => {
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    expect(readme).toContain(OPENAPI_SPEC_PATH);
    expect(readme).toMatch(/\/docs\b/);
    expect(readme).toMatch(/docker compose up/);
    expect(readme).toMatch(/pnpm test/);
    expect(readme).toMatch(/demo/i);
    // The API documentation is delivered separately from the client application, so the README is
    // where a maintainer learns about it.
    expect(readme).toMatch(/not linked|deliberately|separate/i);
  });
});

