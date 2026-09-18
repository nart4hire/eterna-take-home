import type { OpenAPIV3_1 } from "openapi-types";
import { z } from "zod";
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

/**
 * A JSON Schema as this document emits it (the subset we actually write, with `$ref` folded in), plus
 * the container shapes around it. The document is asserted to `OpenAPIV3_1.Document` at one boundary
 * below, because `openapi-types` mixes its 3.0 and 3.1 declarations (its 3.1 path items and
 * parameters are typed with 3.0 schemas) and its `SchemaObject` cannot hold a `$ref`. The real
 * structure is validated by a local validator in `tests/unit/documentation.test.ts`, which is
 * stronger evidence than the typings.
 */
type Schema = {
  type?: string | string[];
  format?: string;
  pattern?: string;
  enum?: readonly (string | number | boolean | null)[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
};

type ResponseObject = { description: string; content?: Record<string, { schema: Schema }> };
type ResponseOrRef = ResponseObject | { $ref: string };
type ParameterObject = { name: string; in: "query" | "path"; required: boolean; description: string; schema: Schema };
type ParameterOrRef = ParameterObject | { $ref: string };
type RequestBodyObject = { required: boolean; content: { "application/json": { schema: Schema } } };
type SecurityRequirement = Record<string, string[]>;
type OperationObject = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  security: SecurityRequirement[];
  parameters?: ParameterOrRef[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseOrRef>;
};
type PathItemObject = Partial<Record<"get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace", OperationObject>>;
type ComponentsObject = {
  securitySchemes: Record<string, { type: "apiKey"; in: "cookie"; name: string; description: string }>;
  parameters: Record<string, ParameterObject>;
  responses: Record<string, ResponseOrRef>;
  schemas: Record<string, Schema>;
};


/** The one machine-readable location of the specification; the standalone viewer fetches this. */
export const OPENAPI_SPEC_PATH = "/api/openapi.json";

/**
 * BetterAuth issues one database-backed session cookie. The plain name is used over http and the
 * `__Secure-` prefix over https (`advanced.useSecureCookies` in `lib/auth/server.ts`), so both are
 * documented; a client sends exactly one of them.
 */
export const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"] as const;

/**
 * Every code that can leave `errorResponse` for an in-range status: the `AppError`s in
 * `lib/http.ts`, `lib/money.ts`, `lib/services/*` and `app/api/**`, plus the retry-exhaustion
 * `TRANSACTION_CONFLICT` and the sanitized `INTERNAL_ERROR` fallback. A 5xx `AppError` is always
 * replaced by `INTERNAL_ERROR`, so only that one represents unexpected failures.
 */
export const ERROR_CODES = [
  "INVALID_JSON",
  "VALIDATION_ERROR",
  "ARITHMETIC_BOUNDS",
  "UNAUTHORIZED",
  "INVALID_CREDENTIALS",
  "ORIGIN_REJECTED",
  "RATE_LIMITED",
  "NOT_FOUND",
  "DUPLICATE_SKU",
  "VERSION_CONFLICT",
  "INSUFFICIENT_STOCK",
  "INVOICE_NOT_EDITABLE",
  "STOCK_OVERFLOW",
  "REGISTRATION_FAILED",
  "TRANSACTION_CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const schemaRef = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name: string): ResponseOrRef => ({ $ref: `#/components/responses/${name}` });

/**
 * Request and query schemas are derived from the very Zod objects the handlers validate with, so the
 * document cannot drift from the accepted input. `io: "input"` keeps transforms out (a UUID is
 * documented as the string the client sends) and the dialect header is dropped because the OpenAPI
 * 3.1 document declares `jsonSchemaDialect` once.
 */
const fromZod = (schema: z.ZodType): Schema => {
  const document = z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" }) as Record<string, unknown>;
  // The dialect header is dropped because the OpenAPI 3.1 document declares `jsonSchemaDialect` once.
  delete document.$schema;
  return document as Schema;
};

/** The single error envelope: `{ error: { code, message, fields? } }`, always JSON, never cached. */
const envelope = (codes: readonly ErrorCode[]): Schema => ({
  type: "object",
  additionalProperties: false,
  required: ["error"],
  description: "The only error shape this API returns. `fields` is present only when a specific input field is at fault.",
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: [...codes], description: "Stable machine-readable code for this failure." },
        message: { type: "string", minLength: 1, description: "Human-readable message; never contains secrets or stack traces." },
        fields: schemaRef("FieldErrors"),
      },
    },
  },
});

const errorResponse = (description: string, codes: readonly ErrorCode[]): ResponseObject => ({
  description,
  content: { "application/json": { schema: envelope(codes) } },
});

/** A success body documented by a named schema, used for the list pages. */
const namedResponse = (name: string, description: string): ResponseObject => ({
  description,
  content: { "application/json": { schema: schemaRef(name) } },
});

/** A success body: every non-empty 2xx response of this API is `{ data: ... }`. */
const dataResponse = (schema: Schema, description?: string): ResponseObject => ({
  ...(description ? { description } : { description: "Successful response." }),
  content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["data"], properties: { data: schema } } } },
});
const nullableText = (maxLength: number, description: string): Schema => ({ type: ["string", "null"], maxLength, description });

/** Shared query parameters, derived from the same schemas the handlers parse the query string with. */
const queryParameters = (schema: z.ZodType, descriptions: Record<string, string>): ParameterObject[] => {
  const document = z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" }) as { properties?: Record<string, Schema> };
  return Object.entries(descriptions).map(([name, description]) => {
    const property = document.properties?.[name];
    if (!property) throw new Error(`Undocumented query parameter: ${name}`);
    return { name, in: "query" as const, required: false, description, schema: property };
  });
};

const invoiceSummarySchema: Schema = {
  type: "object",
  additionalProperties: false,
  description: "Invoice header. Totals are integer cents computed by the server and snapshotted at write time.",
  required: ["id", "invoiceNumber", "customerName", "issueDate", "dueDate", "status", "notes", "taxRateBps", "subtotal", "taxAmount", "total", "version", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    invoiceNumber: { type: "string", description: "Derived from the invoice id, never a count, so concurrent drafts cannot collide." },
    customerName: { type: "string" },
    issueDate: { type: "string", format: "date", description: "Calendar date, `YYYY-MM-DD`." },
    dueDate: { type: "string", format: "date", description: "Calendar date on or after `issueDate`." },
    status: schemaRef("InvoiceStatus"),
    notes: nullableText(2000, "Optional free-text note."),
    taxRateBps: { type: "integer", minimum: 0, maximum: 10000, description: "Tax rate snapshotted from `TAX_RATE_BPS` when the draft was created." },
    subtotal: { type: "integer", minimum: 0, description: "Integer cents; sum of the line totals." },
    taxAmount: { type: "integer", minimum: 0, description: "Integer cents; half-up rounding applied once to the subtotal." },
    total: { type: "integer", minimum: 0, description: "Integer cents; `subtotal + taxAmount`." },
    version: { type: "integer", minimum: 0, description: "Optimistic-locking counter; required for item edits and status changes." },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const invoiceSummaryRequired = invoiceSummarySchema.required as string[];
const invoiceSummaryProperties = invoiceSummarySchema.properties as Record<string, Schema>;

const components: ComponentsObject = {
  securitySchemes: {
    sessionCookie: {
      type: "apiKey",
      in: "cookie",
      name: SESSION_COOKIE_NAMES[0],
      description: `Database-backed BetterAuth session cookie (httpOnly, SameSite=Lax, 7-day fixed expiry, no cookie cache). Logout revokes the session row, so a copied cookie fails immediately. Over https the cookie is named \`${SESSION_COOKIE_NAMES[1]}\` instead.`,
    },
  },
  parameters: {
    Id: {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
      description: "Resource id. A malformed UUID is `422 VALIDATION_ERROR` with `fields.id`; an unknown id, or another user's id, is `404 NOT_FOUND`.",
    },
  },
  responses: {
    InvalidJson: errorResponse("The body was absent, was not `application/json`, or was malformed JSON. Schema failures are `422` instead.", ["INVALID_JSON"]),
    ValidationError: errorResponse("Input failed validation; `fields` names every offending path.", ["VALIDATION_ERROR"]),
    Unauthorized: errorResponse("No valid session. Credentials are checked before input on every protected endpoint, so a missing session is always this answer.", ["UNAUTHORIZED"]),
    InvalidCredentials: errorResponse("Unknown email or wrong password; the body is identical for both so no account existence is revealed.", ["INVALID_CREDENTIALS"]),
    OriginRejected: errorResponse("Mutating endpoints require an exact `Origin` header matching `BETTER_AUTH_URL`; absent or foreign origins are rejected. Command-line clients must send the header.", ["ORIGIN_REJECTED"]),
    NotFound: errorResponse("No such resource for this user. Another user's id is indistinguishable from an unknown one.", ["NOT_FOUND"]),
    RateLimited: errorResponse("BetterAuth rate limit reached; retry later.", ["RATE_LIMITED"]),
    InternalError: errorResponse("Unexpected failure. The message is generic and never contains secrets or stack traces.", ["INTERNAL_ERROR"]),
  },
  schemas: {
    FieldErrors: {
      type: "object",
      description: "Field path to messages. Paths follow the request body, for example `items.0.quantity`.",
      additionalProperties: { type: "array", items: { type: "string" } },
    },
    ErrorEnvelope: envelope(ERROR_CODES),
    SessionUser: {
      type: "object",
      additionalProperties: false,
      description: "The only user fields this API returns; tokens, session ids and hashes never leave the server.",
      required: ["id", "email", "name"],
      properties: {
        id: { type: "string" },
        email: { type: "string", format: "email", description: "Normalized with trim and lowercase." },
        name: { type: "string", description: "Display-only; derived from the email local part at registration." },
      },
    },
    Pagination: {
      type: "object",
      additionalProperties: false,
      required: ["page", "pageSize", "total", "totalPages"],
      properties: {
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        total: { type: "integer", minimum: 0 },
        totalPages: { type: "integer", minimum: 0 },
      },
    },
    ProductDto: {
      type: "object",
      additionalProperties: false,
      description: "A product of the authenticated user. Money is integer cents (displayed as USD); totals are never floats.",
      required: ["id", "sku", "name", "description", "unitPrice", "quantityOnHand", "version", "createdAt", "updatedAt"],
      properties: {
        id: { type: "string", format: "uuid" },
        sku: { type: "string", description: "Uppercased, unique per user; a soft-deleted product keeps its SKU reserved." },
        name: { type: "string" },
        description: nullableText(2000, "Optional free-text description."),
        unitPrice: { type: "integer", minimum: 0, maximum: 2147483647, description: "Integer cents." },
        quantityOnHand: { type: "integer", minimum: 0, maximum: 1000000 },
        version: { type: "integer", minimum: 0, description: "Optimistic-locking counter; every write and every stock change increments it." },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    ProductPage: {
      type: "object",
      additionalProperties: false,
      description: "List responses use this flat Page envelope directly, not a `data` wrapper: newest first, stable by id, no overlapping pages.",
      required: ["data", "pagination"],
      properties: { data: { type: "array", items: schemaRef("ProductDto") }, pagination: schemaRef("Pagination") },
    },
    InvoiceStatus: { type: "string", enum: ["DRAFT", "ISSUED", "PAID", "CANCELLED"], description: "Legal transitions only: `DRAFT` to `ISSUED` or `CANCELLED`, `ISSUED` to `PAID` or `CANCELLED`. `PAID` and `CANCELLED` are terminal." },
    InvoiceSummaryDto: invoiceSummarySchema,
    InvoiceItemDto: {
      type: "object",
      additionalProperties: false,
      description: "A persisted line: the product name and unit price are snapshots taken when the line was first added, so later product edits never rewrite history.",
      required: ["id", "productId", "productName", "unitPrice", "quantity", "lineTotal", "position"],
      properties: {
        id: { type: "string", format: "uuid" },
        productId: { type: "string", format: "uuid" },
        productName: { type: "string", description: "Snapshot; may differ from the product's current name." },
        unitPrice: { type: "integer", minimum: 0, description: "Snapshot in integer cents." },
        quantity: { type: "integer", minimum: 1, maximum: 1000000 },
        lineTotal: { type: "integer", minimum: 0, description: "`unitPrice * quantity` in integer cents." },
        position: { type: "integer", minimum: 0, description: "Zero-based display order." },
      },
    },
    InvoiceDetailDto: {
      type: "object",
      additionalProperties: false,
      required: [...invoiceSummaryRequired, "items"],
      properties: { ...invoiceSummaryProperties, items: { type: "array", items: schemaRef("InvoiceItemDto") } },
    },
    InvoicePage: {
      type: "object",
      additionalProperties: false,
      description: "List responses use this flat Page envelope directly, not a `data` wrapper.",
      required: ["data", "pagination"],
      properties: { data: { type: "array", items: schemaRef("InvoiceSummaryDto") }, pagination: schemaRef("Pagination") },
    },
    RegisterRequest: { ...fromZod(registerSchema), description: "Email and password only. Passwords need at least 8 code points and at most 72 UTF-8 bytes and are stored as bcryptjs cost-12 hashes. Registration does not sign the client in." },
    LoginRequest: fromZod(loginSchema),
    CreateProductRequest: fromZod(createProductSchema),
    UpdateProductRequest: { ...fromZod(updateProductSchema), description: "Partial update. `version` must match the stored version or the write is rejected; at least one mutable field is required." },
    DeleteProductRequest: { ...fromZod(deleteProductSchema), description: "`DELETE` carries its version guard as a JSON body, because an unknown or stale version is rejected rather than silently ignored." },
    CreateInvoiceRequest: { ...fromZod(createInvoiceSchema), description: "Creates a `DRAFT`. Client-supplied prices and totals are not accepted: names, prices and the tax rate are snapshotted server-side and every line is validated against current stock, which is only reserved at issue time." },
    ReplaceInvoiceItemsRequest: { ...fromZod(replaceInvoiceItemsSchema), description: "Replaces the whole item set of a `DRAFT`. Existing lines keep their snapshots, new lines snapshot current product data, and `version` guards against stale edits." },
    TransitionInvoiceRequest: { ...fromZod(transitionInvoiceSchema), description: "Status action guarded by `version`. Issuing deducts stock for every line atomically; cancelling an issued invoice restores it once. Illegal or repeated transitions answer `409 INVOICE_NOT_EDITABLE`." },
    LogoutRequest: { ...fromZod(emptyBodySchema), description: "Logout takes an empty JSON object; the session cookie carries the identity. The session row is revoked, so the cleared cookie cannot be replayed." },
    OpenApiDocument: {
      type: "object",
      description: "This OpenAPI 3.1 document. It is served by the application itself, with no external validator, no CDN and no network access at render time.",
    },
  },
};

/** A JSON request body documented by the same schema the handler validates with. */
const jsonBody = (name: string): RequestBodyObject => ({
  required: true,
  content: { "application/json": { schema: schemaRef(name) } },
});

const paths: Record<string, PathItemObject> = {
  "/api/auth/register": {
    post: {
      tags: ["Auth"],
      summary: "Register with email and password",
      description: "Creates an account and returns it. No session cookie is set: the client signs in separately. Duplicate emails are indistinguishable from any other registration failure.",
      operationId: "registerUser",
      security: [],
      requestBody: jsonBody("RegisterRequest"),
      responses: {
        "201": dataResponse(schemaRef("SessionUser"), "Account created. Deliberately no `Set-Cookie`."),
        "400": responseRef("InvalidJson"),
        "403": responseRef("OriginRejected"),
        "409": errorResponse("Registration failed; a duplicate email is reported here without confirming that the account exists.", ["REGISTRATION_FAILED"]),
        "422": responseRef("ValidationError"),
        "429": responseRef("RateLimited"),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Sign in and start a session",
      description: "Verifies the password against the stored bcryptjs hash and sets the session cookie. Wrong password and unknown email produce the same body.",
      operationId: "loginUser",
      security: [],
      requestBody: jsonBody("LoginRequest"),
      responses: {
        "200": dataResponse(schemaRef("SessionUser"), "Signed in; the session cookie arrives in `Set-Cookie`."),
        "400": responseRef("InvalidJson"),
        "401": responseRef("InvalidCredentials"),
        "403": responseRef("OriginRejected"),
        "422": responseRef("ValidationError"),
        "429": responseRef("RateLimited"),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Revoke the current session",
      description: "Deletes the session row and clears the cookies. A copied cookie stops working immediately afterwards.",
      operationId: "logoutUser",
      security: [{ sessionCookie: [] }],
      requestBody: jsonBody("LogoutRequest"),
      responses: {
        "204": { description: "Session revoked and cookies cleared; no body." },
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/auth/session": {
    get: {
      tags: ["Auth"],
      summary: "Read the current user",
      description: "Returns the public identity behind the session cookie. Tokens, session ids and hashes are never returned.",
      operationId: "readSession",
      security: [{ sessionCookie: [] }],
      responses: {
        "200": dataResponse(schemaRef("SessionUser")),
        "401": responseRef("Unauthorized"),
        "500": responseRef("InternalError"),
      },
    },
  },


  "/api/products": {
    get: {
      tags: ["Products"],
      summary: "List products",
      description: "Owner-scoped, newest first, stable by id. `search` matches the name or the SKU, case-insensitively and literally (wildcards are escaped). Soft-deleted products are never listed.",
      operationId: "listProducts",
      security: [{ sessionCookie: [] }],
      parameters: queryParameters(productListSchema, {
        page: "1-based page number, sent as digits.",
        pageSize: "Rows per page, 1–100; defaults to 20.",
        search: "Optional case-insensitive substring of the name or SKU; an empty string lists everything.",
      }),
      responses: {
        "200": namedResponse("ProductPage", "One page of products in the flat Page envelope."),
        "401": responseRef("Unauthorized"),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
    post: {
      tags: ["Products"],
      summary: "Create a product",
      description: "SKUs are uppercased and unique per user. Prices and quantities are integer units; no monetary value is ever parsed from a float.",
      operationId: "createProduct",
      security: [{ sessionCookie: [] }],
      requestBody: jsonBody("CreateProductRequest"),
      responses: {
        "201": dataResponse(schemaRef("ProductDto"), "Product created."),
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "409": errorResponse("The SKU is already used by one of this user's products, including a soft-deleted one that keeps its SKU reserved.", ["DUPLICATE_SKU"]),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/products/{id}": {
    get: {
      tags: ["Products"],
      summary: "Read one product",
      operationId: "getProduct",
      security: [{ sessionCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/Id" }],
      responses: {
        "200": dataResponse(schemaRef("ProductDto")),
        "401": responseRef("Unauthorized"),
        "404": responseRef("NotFound"),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
    patch: {
      tags: ["Products"],
      summary: "Update a product",
      description: "Send `version` from the last read. A stale version is rejected instead of overwriting a concurrent stock change; a successful write increments the version.",
      operationId: "updateProduct",
      security: [{ sessionCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/Id" }],
      requestBody: jsonBody("UpdateProductRequest"),
      responses: {
        "200": dataResponse(schemaRef("ProductDto"), "Updated product with the incremented version."),
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "404": responseRef("NotFound"),
        "409": errorResponse("`VERSION_CONFLICT` when the stored version differs, `DUPLICATE_SKU` when the new SKU is taken, `TRANSACTION_CONFLICT` when the serializable retry budget is exhausted.", ["VERSION_CONFLICT", "DUPLICATE_SKU", "TRANSACTION_CONFLICT"]),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
    delete: {
      tags: ["Products"],
      summary: "Delete a product",
      description: "Soft delete: the row keeps its SKU and stays referenced by existing invoices, but disappears from lists and new invoice lines. The version guard travels in the JSON body.",
      operationId: "deleteProduct",
      security: [{ sessionCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/Id" }],
      requestBody: jsonBody("DeleteProductRequest"),
      responses: {
        "204": { description: "Product deleted; no body." },
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "404": responseRef("NotFound"),
        "409": errorResponse("`VERSION_CONFLICT` when the stored version differs, `TRANSACTION_CONFLICT` when the serializable retry budget is exhausted.", ["VERSION_CONFLICT", "TRANSACTION_CONFLICT"]),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/invoices": {
    get: {
      tags: ["Invoices"],
      summary: "List invoices",
      description: "Owner-scoped summaries, newest first, stable by id, optionally filtered by status.",
      operationId: "listInvoices",
      security: [{ sessionCookie: [] }],
      parameters: queryParameters(invoiceListSchema, {
        page: "1-based page number, sent as digits.",
        pageSize: "Rows per page, 1–100; defaults to 20.",
        status: "Optional status filter; omit to list every status.",
      }),
      responses: {
        "200": namedResponse("InvoicePage", "One page of invoice summaries in the flat Page envelope."),
        "401": responseRef("Unauthorized"),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
    post: {
      tags: ["Invoices"],
      summary: "Create a draft invoice",
      description: "Snapshots the current product name and price per line, stores the configured tax rate and computes every total server-side. Stock is validated, never reserved.",
      operationId: "createInvoice",
      security: [{ sessionCookie: [] }],
      requestBody: jsonBody("CreateInvoiceRequest"),
      responses: {
        "201": dataResponse(schemaRef("InvoiceDetailDto"), "Draft created with its lines and totals."),
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "404": errorResponse("A line names an unknown, another user's, or a deleted product; `fields` points at that line.", ["NOT_FOUND"]),
        "409": errorResponse("`INSUFFICIENT_STOCK` when a line exceeds current stock (`fields` names the line), `TRANSACTION_CONFLICT` when the serializable retry budget is exhausted.", ["INSUFFICIENT_STOCK", "TRANSACTION_CONFLICT"]),
        "422": errorResponse("`VALIDATION_ERROR` for malformed input (empty, unknown, foreign or duplicate lines) and `ARITHMETIC_BOUNDS` when a line, subtotal or total exceeds the supported cent range.", ["VALIDATION_ERROR", "ARITHMETIC_BOUNDS"]),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/invoices/{id}": {
    get: {
      tags: ["Invoices"],
      summary: "Read one invoice with its lines",
      operationId: "getInvoice",
      security: [{ sessionCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/Id" }],
      responses: {
        "200": dataResponse(schemaRef("InvoiceDetailDto")),
        "401": responseRef("Unauthorized"),
        "404": responseRef("NotFound"),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/invoices/{id}/items": {
    put: {
      tags: ["Invoices"],
      summary: "Replace the lines of a draft",
      description: "Only `DRAFT` invoices can be edited. Lines already on the invoice keep their snapshots; added lines take current product data. The whole set is replaced in one transaction and the totals are recomputed.",
      operationId: "replaceInvoiceItems",
      security: [{ sessionCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/Id" }],
      requestBody: jsonBody("ReplaceInvoiceItemsRequest"),
      responses: {
        "200": dataResponse(schemaRef("InvoiceDetailDto"), "Draft with the replaced lines and recomputed totals."),
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "404": errorResponse("The invoice is unknown or belongs to another user, or a line names an unknown, foreign or deleted product.", ["NOT_FOUND"]),
        "409": errorResponse("`INVOICE_NOT_EDITABLE` when the invoice is not a draft, `VERSION_CONFLICT` when `version` is stale, `INSUFFICIENT_STOCK` when a line exceeds current stock, `TRANSACTION_CONFLICT` when the serializable retry budget is exhausted.", ["INVOICE_NOT_EDITABLE", "VERSION_CONFLICT", "INSUFFICIENT_STOCK", "TRANSACTION_CONFLICT"]),
        "422": errorResponse("`VALIDATION_ERROR` for malformed input and `ARITHMETIC_BOUNDS` when a line, subtotal or total exceeds the supported cent range.", ["VALIDATION_ERROR", "ARITHMETIC_BOUNDS"]),
        "500": responseRef("InternalError"),
      },
    },
  },
  "/api/invoices/{id}/status": {
    patch: {
      tags: ["Invoices"],
      summary: "Issue, mark paid or cancel an invoice",
      description: "Legal transitions only: `DRAFT` to `ISSUED` or `CANCELLED`, `ISSUED` to `PAID` or `CANCELLED`; `PAID` and `CANCELLED` are terminal, so a repeated or illegal action is a 409 and never repeats a stock effect. Issuing deducts every line atomically, and cancelling an issued invoice restores it once — including lines whose product was deleted after the issue.",
      operationId: "transitionInvoice",
      security: [{ sessionCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/Id" }],
      requestBody: jsonBody("TransitionInvoiceRequest"),
      responses: {
        "200": dataResponse(schemaRef("InvoiceDetailDto"), "Invoice with the new status; stock effects are already committed."),
        "400": responseRef("InvalidJson"),
        "401": responseRef("Unauthorized"),
        "403": responseRef("OriginRejected"),
        "404": errorResponse("The invoice is unknown or foreign, or a line's product no longer exists at issue time.", ["NOT_FOUND"]),
        "409": errorResponse("`INVOICE_NOT_EDITABLE` for an illegal or repeated transition, `VERSION_CONFLICT` when `version` is stale, `INSUFFICIENT_STOCK` when issuing exceeds current stock, `STOCK_OVERFLOW` when restoring would exceed the stock bound (the cancellation rolls back), `TRANSACTION_CONFLICT` when the serializable retry budget is exhausted.", ["INVOICE_NOT_EDITABLE", "VERSION_CONFLICT", "INSUFFICIENT_STOCK", "STOCK_OVERFLOW", "TRANSACTION_CONFLICT"]),
        "422": responseRef("ValidationError"),
        "500": responseRef("InternalError"),
      },
    },
  },


  "/api/openapi.json": {
    get: {
      tags: ["Documentation"],
      summary: "This document",
      description: "Serves the OpenAPI 3.1 specification as JSON. It is public, same-origin and self-contained: no CDN, no external `$ref` and no validator is involved in producing or rendering it.",
      operationId: "getOpenApiDocument",
      security: [],
      responses: {
        "200": namedResponse("OpenApiDocument", "The OpenAPI 3.1 document."),
      },
    },
  },
};

/**
 * The specification of the implemented handlers. It is built from the same Zod schemas the routes
 * validate with, so request bodies and query parameters cannot drift from the accepted input, and
 * `tests/unit/documentation.test.ts` keeps the paths, statuses, codes and security honest.
 */
export const openApiDocument = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "StockFlow API",
    version: "1.0.0",
    summary: "Inventory and invoicing for a small distributor, scoped to the signed-in user.",
    description: [
      "Every endpoint is same-origin, JSON-only, and scoped to the session's user: another user's identifier answers exactly like an unknown one.",
      "",
      "**Money** is integer cents everywhere (displayed as USD). The API never accepts client-computed prices or totals, and `TAX_RATE_BPS` is snapshotted on the invoice when it is created.",
      "",
      "**Sessions** are database-backed BetterAuth cookies (`sessionCookie`, httpOnly, SameSite=Lax, 7-day fixed expiry, revoked on logout). Mutating requests must also send an exact `Origin` header matching `BETTER_AUTH_URL`, so command-line clients need `-H 'Origin: <BETTER_AUTH_URL>'` plus the session cookie.",
      "",
      "**Errors** are always `{ error: { code, message, fields? } }`: `400` malformed, absent or non-JSON body; `401` missing or revoked session; `403` rejected origin; `404` unknown or foreign resource; `409` conflicting state; `422` validation (`fields` names the offending paths); `500` sanitized unexpected failure.",
      "",
      "**Drafts** validate availability but never reserve stock; issuing deducts all lines atomically and cancelling an issued invoice restores them once.",
    ].join("\n"),
  },
  servers: [{ url: "/", description: "The application itself; the specification only describes same-origin requests." }],
  tags: [
    { name: "Auth", description: "Registration, sign-in, sign-out and the current session." },
    { name: "Products", description: "Owner-scoped catalogue with stock and optimistic concurrency." },
    { name: "Invoices", description: "Draft invoices with snapshotted lines, then issue, pay or cancel." },
    { name: "Documentation", description: "The machine-readable specification itself. The human-readable viewer is standalone and is deliberately not linked from the client application." },
  ],
  paths,
  components,
} as unknown as OpenAPIV3_1.Document;

