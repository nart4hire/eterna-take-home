# Implementation Plan

## [Overview]

Build StockFlow as a small, secure, tested inventory and invoicing application on the existing Next.js App Router template.

**Status:** implementation specification only; application coding requires separate approval. Source requirements: `/home/areion/projects/eterna-take-home/project.md`. Preserve Next.js 16.3.5, React 19.2.8, TypeScript, Tailwind v4, ESLint 9, pnpm 12.4.2, the root app directory, and the existing `@/*` alias. User choices: shadcn/ui, Prisma, PostgreSQL in Docker Compose, TDD with at least one test per requirement, Swagger, and BetterAuth with explicit bcryptjs password hashing.

Use thin Node.js Route Handlers, server-only auth/database/services, shared validation and integer money helpers, and small client forms. Pages authenticate on the server; every protected endpoint independently authenticates and scopes queries by session user ID. No React Query, global auth provider, separate backend, pgAdmin, stock ledger, dashboard analytics, or additional roles. The two optional additions are concurrency protection and focused browser tests; neither expands product scope.

Confirmed Next.js conventions: dynamic params, headers, and cookies are asynchronous. A root middleware.ts is deprecated; proxy.ts is optional and will NOT be added. Dashboard layout redirects improve UX but do not replace per-operation authorization. Never globally cache sessions or user data. Read the installed relevant Next guides before application edits.

### Explicit business and security decisions

- One fixed two-decimal monetary unit, displayed as USD for this exercise; document this assumption. API prices and totals are integer cents. No multi-currency. Parse entered decimal strings digit-by-digit, never `parseFloat(value) * 100`.
- `TAX_RATE_BPS` is an integer from 0 to 10000, default 1100 (11%). Store its value on invoice creation. Tax rounds half-up once on subtotal: integer numerator = subtotal * rate; quotient plus one if remainder >= 5000. Validate money in 0..2147483647; intermediate integer products remain within JS safe integer bounds. Reject overflowing line totals, subtotals, or final totals with 422.
- Drafts do not reserve stock. Validate availability on creation and item editing, and recheck at issue. Reject duplicate product IDs with indexed field errors, rather than letting split lines bypass the stock guard.
- New invoice items snapshot current product name/price. On draft replacement, retain snapshots for products already on that invoice; only newly added products take current snapshots. Existing tax rate remains unchanged. No client-supplied prices/totals/tax/status/userId accepted.
- Soft-delete products; exclude them from product lists and new selections, preserve invoice references and historical details. SKU remains reserved after deletion. A draft containing a deleted product cannot issue; it must remove/replace that line. Cancellation still restores quantities on deleted products. No restore-product feature.
- Legal transitions only: DRAFT -> ISSUED or CANCELLED; ISSUED -> PAID or CANCELLED. PAID and CANCELLED are terminal. Repeating a status action returns 409, without repeating stock effects. Only draft line items can be edited; invoice metadata editing/deletion is not in scope.
- Run invoice creation, item replacement, and status changes in serializable Prisma transactions with at most three attempts for retryable transaction conflicts. Claim status using an owner/current-status conditional update. Deduct using owner/active/quantity-gte conditional updates, sorted by product ID. Throw on any failed update so the entire transaction rolls back. Restore all lines in the same transaction on issued cancellation only. Product writes use a version check; every stock mutation increments version, preventing stale manual quantities from overwriting stock changes. Cancellation overflow rolls back with 409.
- BetterAuth uses PostgreSQL sessions, cookie cache disabled, fixed seven-day expiry with session refresh disabled. Cookies are httpOnly, SameSite=Lax, path=/, Secure in production. Logout revokes the database session and clears cookies; copied old cookies must fail immediately afterward.
- Configure bcryptjs cost 12 with random salt per hash. Register requires >=8 Unicode code points and <=72 UTF-8 bytes; do not trim or silently truncate passwords. Validate the upper bound on login too. Normalize emails with trim/lowercase, not provider-specific rewriting.
- Public auth wrappers accept email/password only; supply BetterAuth's required name as the normalized email. Return generic invalid-credentials errors for unknown email/wrong password and generic registration failure for duplicate email. Validation errors may identify malformed input, never account existence. Test library behavior rather than assuming it.
- Mutating endpoints require JSON and an exact Origin matching BETTER_AUTH_URL; absent/foreign origins return 403. Document Origin for command-line API clients. Check authentication first on protected endpoints so missing credentials always yield 401. Preserve BetterAuth origin protections as well. No permissive credentialed CORS.
- All resource lookups use owner scope; another user's identifier returns 404, including nested product references. Request bodies never supply ownership. Unexpected errors return a generic 500 without secrets/stack traces; server logs must redact credentials and cookies.

**Environment finding:** Node 24.21.0 and pnpm 12.4.2 are available. Docker is currently unavailable in this WSL distro; enable Docker Desktop WSL integration or provide Docker Engine before PostgreSQL validation. No app tests or database execution have yet occurred.

## [Types]

### Database model specification

All model definitions go in `/home/areion/projects/eterna-take-home/prisma/schema.prisma`. Use Prisma 7 `prisma-client` generator with explicit output `/home/areion/projects/eterna-take-home/generated/prisma`; PostgreSQL provider, pg adapter, URL in prisma.config.ts. Auth IDs are strings managed by BetterAuth; domain IDs are UUID strings. Required unless marked `?`. Timestamps are DateTime, createdAt defaults now, updatedAt maintained automatically. Generate/compare the auth models against the selected BetterAuth version before committing the migration; do not use Auth.js field names.

| Model | Fields and constraints |
|---|---|
| User | id String PK; name String; email String unique normalized; emailVerified Boolean default false; image String?; createdAt; updatedAt; relations sessions/accounts/products/invoices |
| Account | id String PK; accountId String; providerId String; userId FK User; password String? (bcrypt hash for credential provider); accessToken, refreshToken, idToken, scope String?; accessTokenExpiresAt, refreshTokenExpiresAt DateTime?; createdAt; updatedAt; unique(providerId, accountId); index(userId) |
| Session | id String PK; token String unique; userId FK User; expiresAt DateTime; ipAddress, userAgent String?; createdAt; updatedAt; index(userId) |
| Verification | id String PK; identifier String; value String; expiresAt DateTime; createdAt; updatedAt; index(identifier); retained for adapter compatibility, no verification/email feature |
| Product | id UUID PK; userId FK User; sku String; name String; description String?; unitPrice Int cents; quantityOnHand Int; version Int default 0; deletedAt DateTime?; createdAt; updatedAt; unique(userId, sku); index(userId, deletedAt, createdAt) |
| Invoice | id UUID PK; userId FK User; invoiceNumber String unique; customerName String; issueDate and dueDate DateTime @db.Date; status InvoiceStatus default DRAFT; notes String?; taxRateBps Int; subtotal, taxAmount, total Int cents; version Int default 0; createdAt; updatedAt; index(userId, status, createdAt) |
| InvoiceItem | id UUID PK; invoiceId FK Invoice; productId FK Product; productName String snapshot; unitPrice Int cents snapshot; quantity Int; lineTotal Int cents; position Int; unique(invoiceId, productId); unique(invoiceId, position); index(productId) |

Enum InvoiceStatus = DRAFT | ISSUED | PAID | CANCELLED. Product reference deletion is RESTRICT; invoice item relation may cascade on invoice deletion (no public deletion endpoint). User-domain deletion is RESTRICT; auth sessions/accounts may cascade. Add SQL CHECK constraints to the initial migration for nonnegative prices/stock/totals, positive quantities, bounded tax, dueDate >= issueDate, and lineTotal = unitPrice * quantity (cast to bigint in SQL). Application validates cross-row totals and ownership within transactions; no aggregate CHECK claim. Invoice numbers use `INV-<UTC creation year>-<full UUID>` from the new invoice ID, not count+1; document deliberately nonsequential format.

### Boundary and response types

In `/home/areion/projects/eterna-take-home/lib/validation/schemas.ts`, define strict Zod objects; inferred types are exported. Unknown keys return 422. Trim text; normalize SKU uppercase (1..64), name/customerName 1..200, description/notes <=2000; null clears optional text. Email <=254 and syntactically valid. IDs validate UUID for domain objects only. JSON numbers must be integers, not coerced strings; query pagination accepts validated digit strings.

- `RegisterInput`, `LoginInput`: email, password only; normalization and policy as above.
- `CreateProductInput`: sku, name, description?, unitPrice 0..2147483647, quantityOnHand 0..1000000.
- `UpdateProductInput`: at least one mutable product field plus required version >=0. `DeleteProductInput`: version >=0. Stale/deleted rows return 409/404 respectively.
- `PaginationInput`: page >=1 default 1, pageSize 1..100 default 20; reject unsafe offset. `ProductListInput`: pagination + search <=200 default empty. `InvoiceListInput`: pagination + optional InvoiceStatus.
- `InvoiceLineInput`: productId, quantity 1..1000000. `CreateInvoiceInput`: customerName, issueDate, dueDate, notes?, items length 1..100. Dates are real YYYY-MM-DD calendar dates, dueDate >= issueDate, serialized as dates without timezone drift.
- `ReplaceInvoiceItemsInput`: version >=0 and items as above. `TransitionInvoiceInput`: version >=0, status in ISSUED | PAID | CANCELLED. Invoice version increments on item edits and status changes; stale version returns 409.
- `/home/areion/projects/eterna-take-home/lib/types.ts`: `SessionUser = { id: string; email: string; name: string }`; `Page<T> = { data: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }`; `ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string[]> } }`. Fields use paths such as items.0.quantity. Single-resource responses `{ data: T }`; DELETE/logout 204; registration/create 201; reads/login/updates 200.
- Export ProductDto (public product fields including version, excluding userId/deletedAt), InvoiceSummaryDto (metadata, totals, taxRateBps, version), InvoiceDetailDto (summary + snapshot items), and MoneyTotals (lineTotals number[], subtotal, taxAmount, total). Timestamps serialize ISO; invoice dates serialize YYYY-MM-DD. Never serialize accounts, hashes, session tokens, or raw Prisma relations.
- Status mapping: 400 malformed JSON/non-JSON body; 401 invalid/missing/expired auth; 403 origin rejection; 404 unavailable owned resource; 409 duplicate SKU/stale version/stock/transition conflict; 422 validation/arithmetic bounds; 500 unexpected errors. Describe optional library 429 responses if retained; no custom rate limiter in scope.

## [Files]

All listed files are planned, not implemented. No existing application files are deleted or moved; unused template assets may remain. The original draft's proposed files never existed.

### Infrastructure and server files to create

- `/home/areion/projects/eterna-take-home/docker-compose.yml`: postgres:17 service for development (named volume, localhost:5432, pg_isready healthcheck); separate postgres-test service under test profile (localhost:5433, tmpfs, database stockflow_test). App runs with pnpm on host, not in Docker. No automatic destructive volume removal.
- `/home/areion/projects/eterna-take-home/.env.example`: complete safe configuration inventory described in Dependencies.
- `/home/areion/projects/eterna-take-home/prisma.config.ts`: dotenv loading, schema path, migration directory, explicit tsx seed command, PostgreSQL URL.
- `/home/areion/projects/eterna-take-home/prisma/schema.prisma`: models from Types.
- `/home/areion/projects/eterna-take-home/prisma/migrations/20260918000100_init/migration.sql`: initial PostgreSQL DDL and CHECK constraints; Prisma migration lock file at `/home/areion/projects/eterna-take-home/prisma/migrations/migration_lock.toml`.
- `/home/areion/projects/eterna-take-home/prisma/seed.ts`: idempotent demo registration through configured BetterAuth hashing and five product upserts; no sample invoice needed. Refuse production seed; do not reset existing stock/passwords on rerun. README demo: demo@stockflow.local / StockFlowDemo!2026 (public local-only credentials).
- `/home/areion/projects/eterna-take-home/lib/env.ts`: validated server configuration, no secrets in client bundles.
- `/home/areion/projects/eterna-take-home/lib/prisma.ts`: pg-adapter Prisma singleton; no eager database queries at build/import time.
- `/home/areion/projects/eterna-take-home/lib/auth/server.ts`: BetterAuth configuration; no public catch-all auth route. Only the four explicit wrapper routes below expose required auth functions.
- `/home/areion/projects/eterna-take-home/lib/auth/password.ts`: bcrypt hashing/verification and byte policy.
- `/home/areion/projects/eterna-take-home/lib/auth/session.ts`: session lookup, required API session, required page session.
- `/home/areion/projects/eterna-take-home/lib/http.ts`: error mapping, JSON parsing, origin validation, public DTO response helpers.
- `/home/areion/projects/eterna-take-home/lib/types.ts`: boundary types/DTOs.
- `/home/areion/projects/eterna-take-home/lib/validation/schemas.ts`: strict Zod schemas.
- `/home/areion/projects/eterna-take-home/lib/money.ts`: pure shared integer calculation/parsing/formatting.
- `/home/areion/projects/eterna-take-home/lib/services/products.ts`: owner-scoped CRUD/search/version checks.
- `/home/areion/projects/eterna-take-home/lib/services/invoices.ts`: snapshot creation, draft replacement, status state machine, atomic stock updates.
- `/home/areion/projects/eterna-take-home/lib/services/transaction.ts`: bounded serialization-conflict retry.
- `/home/areion/projects/eterna-take-home/lib/openapi.ts`: typed OpenAPI 3.1 object including cookie security, Origin header, integer money, field errors, pagination, statuses, examples.
- `/home/areion/projects/eterna-take-home/lib/utils.ts`: shadcn cn helper only; do not bury business logic here.
- `/home/areion/projects/eterna-take-home/lib/client-api.ts`: typed fetch wrapper for forms, normalized errors, session-expiry handling.

### Route Handler files to create

| Full file path | Methods and contract |
|---|---|
| `/home/areion/projects/eterna-take-home/app/api/auth/register/route.ts` | POST RegisterInput -> 201 public user; disable automatic sign-in; duplicate -> generic 409 |
| `/home/areion/projects/eterna-take-home/app/api/auth/login/route.ts` | POST LoginInput -> 200 public user + all BetterAuth Set-Cookie headers; bad credentials -> same 401 |
| `/home/areion/projects/eterna-take-home/app/api/auth/logout/route.ts` | POST empty JSON -> 204; BetterAuth signOut invalidates and clears cookies; expired/missing session remains harmless |
| `/home/areion/projects/eterna-take-home/app/api/auth/session/route.ts` | GET -> 200 public user, else 401; never return raw session token |
| `/home/areion/projects/eterna-take-home/app/api/products/route.ts` | GET paginated name/SKU search; POST product |
| `/home/areion/projects/eterna-take-home/app/api/products/[id]/route.ts` | GET detail; PATCH update; DELETE soft-delete with version JSON |
| `/home/areion/projects/eterna-take-home/app/api/invoices/route.ts` | GET paginated/status-filtered summaries; POST draft |
| `/home/areion/projects/eterna-take-home/app/api/invoices/[id]/route.ts` | GET owned detail |
| `/home/areion/projects/eterna-take-home/app/api/invoices/[id]/items/route.ts` | PUT entire draft item set with version |
| `/home/areion/projects/eterna-take-home/app/api/invoices/[id]/status/route.ts` | PATCH status with version |
| `/home/areion/projects/eterna-take-home/app/api/openapi.json/route.ts` | GET public spec |

All handlers export runtime nodejs. Authenticate before parsing protected inputs; await dynamic params. List results sort createdAt descending then id ascending, count under the same owner/search/status conditions. Empty results return data=[], totalPages=0. Use no-store on session and owned responses. Auth wrappers call BetterAuth server API with request headers and response mode, safely remap JSON/errors and forward each Set-Cookie separately (not comma-joined). Disable unused externally accessible auth features by not mounting a catch-all; no BetterAuth client/provider needed.

### Frontend files to create

Pages are server shells; loaders validate sessions without HTTP self-fetches. Client forms receive serializable DTOs/tax integer, never server env/Prisma. Client lists/forms use the documented API and navigation-driven refresh; no form/state framework needed.

| Full file path | Component and purpose |
|---|---|
| `/home/areion/projects/eterna-take-home/app/(auth)/login/page.tsx` | LoginPage: AuthForm login mode |
| `/home/areion/projects/eterna-take-home/app/(auth)/register/page.tsx` | RegisterPage: AuthForm; registration leads to login |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/layout.tsx` | DashboardLayout: requirePageUser, navigation, LogoutButton |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/loading.tsx` | DashboardLoading: accessible loading skeleton |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/error.tsx` | DashboardError: client boundary with safe message/retry |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/products/page.tsx` | ProductsPage: search/pagination/delete |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/products/new/page.tsx` | NewProductPage: ProductForm |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/products/[id]/edit/page.tsx` | EditProductPage: owner-scoped initial product |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/invoices/page.tsx` | InvoicesPage: status filter/pagination |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/invoices/new/page.tsx` | NewInvoicePage: InvoiceForm with configured tax |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/invoices/[id]/page.tsx` | InvoiceDetailPage: snapshots/totals/actions/draft-edit link |
| `/home/areion/projects/eterna-take-home/app/(dashboard)/invoices/[id]/edit/page.tsx` | EditInvoicePage: draft-only InvoiceForm with snapshots/version |
| `/home/areion/projects/eterna-take-home/app/docs/page.tsx` | DocsPage: SwaggerViewer |
| `/home/areion/projects/eterna-take-home/app/error.tsx` | RootError: non-dashboard fallback |
| `/home/areion/projects/eterna-take-home/app/not-found.tsx` | NotFound: readable missing-resource state |
| `/home/areion/projects/eterna-take-home/components/auth-form.tsx` | AuthForm: credentials, pending, server errors |
| `/home/areion/projects/eterna-take-home/components/logout-button.tsx` | LogoutButton: revoke then full redirect; display failure |
| `/home/areion/projects/eterna-take-home/components/product-form.tsx` | ProductForm: decimal-string input, cents payload, version-aware save |
| `/home/areion/projects/eterna-take-home/components/product-list.tsx` | ProductList: search/table/pagination/confirmed delete |
| `/home/areion/projects/eterna-take-home/components/invoice-form.tsx` | InvoiceForm: dates/customer/notes, lines, live totals, draft editing |
| `/home/areion/projects/eterna-take-home/components/product-picker.tsx` | ProductPicker: paginated search, including beyond first 100 products |
| `/home/areion/projects/eterna-take-home/components/invoice-list.tsx` | InvoiceList: status filter/links/pagination |
| `/home/areion/projects/eterna-take-home/components/invoice-actions.tsx` | InvoiceActions: legal transitions/pending/conflict refresh |
| `/home/areion/projects/eterna-take-home/components/pagination.tsx` | Pagination: query-driven previous/next |
| `/home/areion/projects/eterna-take-home/components/swagger-viewer.tsx` | SwaggerViewer: client-only swagger-ui-dist; same-origin cookies, no CDN/external validator |
| `/home/areion/projects/eterna-take-home/components.json` | shadcn Tailwind v4 configuration, existing @ alias |

Generate only required shadcn files: `/home/areion/projects/eterna-take-home/components/ui/button.tsx`, `/home/areion/projects/eterna-take-home/components/ui/input.tsx`, `/home/areion/projects/eterna-take-home/components/ui/label.tsx`, `/home/areion/projects/eterna-take-home/components/ui/textarea.tsx`, `/home/areion/projects/eterna-take-home/components/ui/table.tsx`, `/home/areion/projects/eterna-take-home/components/ui/card.tsx`, `/home/areion/projects/eterna-take-home/components/ui/badge.tsx`, `/home/areion/projects/eterna-take-home/components/ui/alert.tsx`, `/home/areion/projects/eterna-take-home/components/ui/alert-dialog.tsx`, `/home/areion/projects/eterna-take-home/components/ui/skeleton.tsx`. Native select suffices for status. Use labels, role=alert, aria-busy, empty states, disabled duplicate submissions. API 401 navigates to login; no unvalidated return URLs. Display saved server totals even if a stale product preview differed; label preview provisional.

### Existing files to modify during implementation

- `/home/areion/projects/eterna-take-home/app/layout.tsx`: StockFlow metadata, no auth/query providers; system fonts instead of network-dependent Google font build.
- `/home/areion/projects/eterna-take-home/app/page.tsx`: Home redirects to products/login using real session.
- `/home/areion/projects/eterna-take-home/app/globals.css`: shadcn Tailwind v4 tokens, responsive layout/system fonts.
- `/home/areion/projects/eterna-take-home/package.json` and `/home/areion/projects/eterna-take-home/pnpm-lock.yaml`: dependencies/scripts; exact resolved lockfile.
- `/home/areion/projects/eterna-take-home/.gitignore`: preserve .env* exclusion, add !.env.example; ignore generated Prisma/playwright-report/test-results.
- `/home/areion/projects/eterna-take-home/eslint.config.mjs`: ignore generated Prisma/test artifacts, preserve Next rules.
- `/home/areion/projects/eterna-take-home/mise.toml`: pin tested Node 24 and pnpm 12.4.2.
- `/home/areion/projects/eterna-take-home/pnpm-workspace.yaml`: approve only verified necessary dependency builds if needed.
- `/home/areion/projects/eterna-take-home/README.md`: prerequisites, clean-clone setup, env table, migrations/seed, one shared app process, demo credentials, tests, Swagger URL, 5–10 tech-choice bullets, trade-offs, one-more-week ideas, honest AI usage, actual hours supplied by user, submission checklist. Never invent hours.
- Preserve `/home/areion/projects/eterna-take-home/tsconfig.json` alias and `/home/areion/projects/eterna-take-home/next.config.ts` unless verified compatibility requires changes.

### Test/documentation files

Create the test files listed with full paths in Testing. Create `/home/areion/projects/eterna-take-home/vitest.config.ts`, `/home/areion/projects/eterna-take-home/playwright.config.ts`, `/home/areion/projects/eterna-take-home/scripts/test.ts`, `/home/areion/projects/eterna-take-home/tests/setup.ts`, `/home/areion/projects/eterna-take-home/tests/helpers.ts` for the harness described there. Planning documentation: `/home/areion/projects/eterna-take-home/implementation_plan.md` and the six core documents under `/home/areion/projects/eterna-take-home/.clinerules/memory-bank/`; add a location index to `/home/areion/projects/eterna-take-home/.clinerules/memorybank.md` without replacing its rules.

## [Functions]

All new except Home/RootLayout. Services require authenticated userId and are shared by pages/routes. No repository classes or in-memory database substitute.

| Full file path | Signatures and responsibility |
|---|---|
| `/home/areion/projects/eterna-take-home/lib/env.ts` | `readEnv(source: NodeJS.ProcessEnv): ServerEnv`: validate databaseUrl, authUrl, authSecret, nodeEnv (strings) and taxRateBps (number), server-only. |
| `/home/areion/projects/eterna-take-home/lib/prisma.ts` | `getPrisma(): PrismaClient`: lazy singleton with PrismaPg. |
| `/home/areion/projects/eterna-take-home/lib/auth/password.ts` | `hashPassword(password:string): Promise<string>`; `verifyPassword(input:{password:string;hash:string}): Promise<boolean>`; `validatePassword(password:string): void`: bcrypt and byte/codepoint policy. |
| `/home/areion/projects/eterna-take-home/lib/auth/server.ts` | `getAuth(): ReturnType<typeof betterAuth>`: lazy BetterAuth instance with Prisma adapter. |
| `/home/areion/projects/eterna-take-home/lib/auth/session.ts` | `getSessionUser(headers:Headers): Promise<SessionUser\|null>`; `requireAuth(headers:Headers): Promise<SessionUser>` -> 401; `requirePageUser(): Promise<SessionUser>` -> redirect. Each data-bearing page calls it, not only layout. |
| `/home/areion/projects/eterna-take-home/lib/http.ts` | `readJson<T>(request:Request,schema:z.ZodType<T>): Promise<T>`; `assertSameOrigin(request:Request): void`; `errorResponse(error:unknown): Response`; `handleRoute(fn:()=>Promise<Response>): Promise<Response>`; `forwardAuthResponse(response:Response,kind:'login'\|'register'\|'logout'): Promise<Response>` preserves cookies, normalizes body/errors. |
| `/home/areion/projects/eterna-take-home/lib/money.ts` | `parseMoney(value:string): number`; `formatMoney(cents:number): string`; `calculateTotals(lines:readonly {unitPrice:number;quantity:number}[],taxRateBps:number): MoneyTotals`: exact integer parsing, bounds and half-up tax. |
| `/home/areion/projects/eterna-take-home/lib/services/products.ts` | `listProducts(userId:string,query:ProductListInput): Promise<Page<ProductDto>>`; `getProduct(userId:string,id:string): Promise<ProductDto>`; `createProduct(userId:string,input:CreateProductInput): Promise<ProductDto>`; `updateProduct(userId:string,id:string,input:UpdateProductInput): Promise<ProductDto>`; `deleteProduct(userId:string,id:string,input:DeleteProductInput): Promise<void>`. Conditional version write and returned record share a transaction; SKU collision becomes field error. |
| `/home/areion/projects/eterna-take-home/lib/services/invoices.ts` | `listInvoices(userId:string,query:InvoiceListInput): Promise<Page<InvoiceSummaryDto>>`; `getInvoice(userId:string,id:string): Promise<InvoiceDetailDto>`; `createInvoice(userId:string,input:CreateInvoiceInput): Promise<InvoiceDetailDto>`; `replaceInvoiceItems(userId:string,id:string,input:ReplaceInvoiceItemsInput): Promise<InvoiceDetailDto>`; `transitionInvoice(userId:string,id:string,input:TransitionInvoiceInput): Promise<InvoiceDetailDto>`: all snapshot/money/stock/state rules. |
| `/home/areion/projects/eterna-take-home/lib/services/invoices.ts` | `assertTransition(from:InvoiceStatus,to:InvoiceStatus): void`; `generateInvoiceNumber(id:string,createdAt:Date): string`; private `snapshotItems(tx:Prisma.TransactionClient,userId:string,items:InvoiceLineInput[],existing:readonly InvoiceItem[]): Promise<SnapshotLine[]>`: validate owner/stock, retain snapshots. SnapshotLine has productId,productName,unitPrice,quantity,lineTotal,position. |
| `/home/areion/projects/eterna-take-home/lib/services/transaction.ts` | `withSerializableRetry<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>): Promise<T>`: three total attempts for recognized serialization/deadlock conflicts only; exhaustion -> 409. |
| `/home/areion/projects/eterna-take-home/lib/client-api.ts` | `apiFetch<T>(url:string,init?:RequestInit): Promise<T>`: same-origin JSON/cookies, 204 handling, typed errors, 401 navigation. |
| `/home/areion/projects/eterna-take-home/lib/utils.ts` | `cn(...inputs:ClassValue[]): string`: shadcn class merge. |
| `/home/areion/projects/eterna-take-home/prisma/seed.ts` | `seed(): Promise<void>`: demo setup, disconnect finally, nonzero failure exit. |

Route exports match Files: `(request:Request,context:{params:Promise<{id:string}>}): Promise<Response>` on ID routes; omit context otherwise. Page/component names are listed in Files, using explicit DTO/input props and JSX.Element (Promise for async pages); dynamic pages await params/searchParams. Local form submit handlers call apiFetch and surface field errors.

Modified `Home` in `/home/areion/projects/eterna-take-home/app/page.tsx` becomes async session redirect. `RootLayout` in `/home/areion/projects/eterna-take-home/app/layout.tsx` retains children rendering with updated metadata/fonts. No existing business functions to remove.

## [Classes]

New `AppError extends Error` in `/home/areion/projects/eterna-take-home/lib/http.ts`: constructor `(status:number,code:string,message:string,fields?:Record<string,string[]>)`, readonly status/code/fields; errorResponse handles it predictably. New `ApiClientError extends Error` in `/home/areion/projects/eterna-take-home/lib/client-api.ts`: constructor `(status:number,body:ApiErrorBody)`, exposing status/body to forms. No other new/modified/removed classes. Use generated PrismaClient/library errors directly.

## [Dependencies]

Keep current framework versions. These packages are planned additions, not currently installed. Resolve/pin compatible stable versions when implementing; do not use a moving latest tag for Prisma (registry inspection returned an 8 prerelease incompatible with the selected auth peer range). Target Prisma CLI/client/adapter-pg on the same 7.x release, BetterAuth 1.7.x, bcryptjs 3.x, Zod 4.x, pg 8.x, Vitest 5.x, tsx 4.x. Confirm package engines against Node 24 and lock exact versions before coding against their APIs.

- Runtime: better-auth, @prisma/client, @prisma/adapter-pg, pg, bcryptjs, zod, server-only, swagger-ui-dist; shadcn-generated dependencies only (clsx, tailwind-merge, class-variance-authority, icon/primitive packages actually imported by selected components). No Auth.js, jose direct dependency, React Query or CDN runtime dependency.
- Development: prisma, tsx, dotenv, vitest, @vitest/coverage-v8 (same Vitest version), @playwright/test, @types/pg, @types/swagger-ui-dist, openapi-types, @apidevtools/swagger-parser; shadcn CLI used only to generate the selected components. Do not add every UI component or install speculative packages.
- Prisma config explicitly loads dotenv; migration, seed, app and test subprocesses all use PostgreSQL. Generate client explicitly before build/typecheck; seeding is explicit, never assumed to happen with migration.
- SwaggerViewer dynamically imports swagger-ui-dist on the client with cleanup, imports local packaged CSS, loads the spec URL, disables external validator, and includes cookies for same-origin requests. Document the actual dev/production cookie names from the pinned BetterAuth config. No bearer-token scheme for cookie auth.

Environment inventory for `/home/areion/projects/eterna-take-home/.env.example` and README:

| Variable | Example/default and purpose |
|---|---|
| DATABASE_URL | postgresql://stockflow:local_only_change_me@localhost:5432/stockflow; local safe example, never production credentials |
| TEST_DATABASE_URL | postgresql://stockflow:local_test_only@localhost:5433/stockflow_test; isolated tests only |
| POSTGRES_USER | stockflow; Compose local DB username |
| POSTGRES_PASSWORD | local_only_change_me; development Compose password |
| POSTGRES_DB | stockflow; development database |
| TEST_POSTGRES_PASSWORD | local_test_only; test Compose password |
| BETTER_AUTH_SECRET | REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS; reject unchanged placeholder when starting auth; document Node crypto generation command |
| BETTER_AUTH_URL | http://localhost:3000; exact trusted app origin |
| TAX_RATE_BPS | 1100; integer 0..10000, omission defaults 11% |
| NODE_ENV | development for local use; Next sets production for build/start and test harness overrides test |

No NEXT_PUBLIC secrets. Tests generate a temporary auth secret, set BETTER_AUTH_URL=http://localhost:3100 and DATABASE_URL=validated TEST_DATABASE_URL in child process environment before imports; never change the user's .env. POSTGRES passwords and URLs must agree, as documented.

Planned pnpm scripts: `db:up` -> docker compose up -d --wait postgres; `db:generate` -> prisma generate; `db:migrate` -> prisma migrate deploy (clean clone); `db:migrate:dev` -> prisma migrate dev (schema authors only); `db:seed` -> prisma db seed; `typecheck` -> next typegen && tsc --noEmit; `build` -> prisma generate && next build; keep dev/start/lint. `test` -> tsx scripts/test.ts (prepare isolated Postgres, migrate, unit/integration then browser suite); `test:unit` -> vitest run with unit include; `test:integration` and `test:e2e` delegate to harness subset argument. Document pnpm exec playwright install --with-deps chromium as one-time prerequisite. Test runner must pass exit codes and clean up owned child processes.

## [Testing]

### TDD execution and database isolation

Write the relevant failing test first, run it to confirm expected failure (not only import/config failure), implement the smallest change, rerun green, refactor and rerun. Record commands/results in memory bank after each slice. No existing application tests exist. Infrastructure harness necessarily precedes runnable business tests; build it with safety/unit tests before destructive test setup.

`/home/areion/projects/eterna-take-home/scripts/test.ts`: `assertSafeTestDatabase(testUrl:string,devUrl:string): void` rejects non-PostgreSQL URLs, matching development host/port/database, remote hosts, database other than stockflow_test, and non-5433 port. `runTests(subset?:'unit'|'integration'|'e2e'): Promise<void>` starts only test Compose service, waits healthy, generates client, deploys same migration history and runs suites serially with explicit test env. Never reset development DB. Vitest tests run serial files against test DB, with concurrency only inside intentional race tests. `/home/areion/projects/eterna-take-home/tests/setup.ts` deletes test data in FK order after validating target; disconnects in teardown. `/home/areion/projects/eterna-take-home/tests/helpers.ts` provides `registerAndLogin(): Promise<{user:SessionUser;cookie:string}>`, `makeRequest(path:string,options:RequestInit): Request`, and `createProductFixture(userId:string): Promise<ProductDto>` with unique fixture data.

Integration tests invoke exported Route Handlers with real Requests, real BetterAuth and real PostgreSQL, not mocked Prisma or auth guards. Keep request-scoped Next helpers in page-only wrappers; route session lookups take explicit headers. Vitest may alias server-only to an empty test-only module via config, never disable real auth. E2E tests use a real Next server on port 3100 with test database, reuseExistingServer=false and one Chromium worker; API interception only for deterministic UI loading/error checks. No public test-reset HTTP route. Harness migrates/clears test DB between Vitest and browser phase; E2E uses unique users, no shared seed dependence.

### Requirement-to-test matrix

Prefix actual tests with IDs. File keys resolve to these new files:
- AUTH: `/home/areion/projects/eterna-take-home/tests/integration/auth.test.ts`
- PRODUCTS: `/home/areion/projects/eterna-take-home/tests/integration/products.test.ts`
- INVOICES: `/home/areion/projects/eterna-take-home/tests/integration/invoices.test.ts`
- SECURITY: endpoint-specific cases in `/home/areion/projects/eterna-take-home/tests/integration/products.test.ts`, `/home/areion/projects/eterna-take-home/tests/integration/invoices.test.ts` and `/home/areion/projects/eterna-take-home/tests/integration/invoice-lifecycle.test.ts`; no shared authorization test file. Lifecycle cases in the matrix use the latter file (T07), while draft cases stay in invoices.test.ts (T06).
- MONEY: `/home/areion/projects/eterna-take-home/tests/unit/money.test.ts`
- ENV: `/home/areion/projects/eterna-take-home/tests/unit/env.test.ts`
- HARNESS: `/home/areion/projects/eterna-take-home/tests/unit/test-harness.test.ts`
- DOCS: `/home/areion/projects/eterna-take-home/tests/unit/documentation.test.ts`
- ERRORS: `/home/areion/projects/eterna-take-home/tests/unit/http.test.ts`
- SEED: `/home/areion/projects/eterna-take-home/tests/integration/seed.test.ts`
- UI: separate owned specs `/home/areion/projects/eterna-take-home/tests/e2e/auth.spec.ts` (T04), `/home/areion/projects/eterna-take-home/tests/e2e/products.spec.ts` (T08), `/home/areion/projects/eterna-take-home/tests/e2e/invoices.spec.ts` (T09), `/home/areion/projects/eterna-take-home/tests/e2e/docs.spec.ts` (T10). No single shared stockflow.spec.ts; F5/F6 are verified per page family. Additional foundation files/tests are owned explicitly in the dependency graph.

| ID | File key: named test / assertions |
|---|---|
| A1 | AUTH: registers normalized email; rejects malformed/duplicate email including case variants |
| A2 | AUTH: login sets cookie; subsequent request authenticates; cookie attributes correct |
| A3 | AUTH: logout deletes session and rejects copied cookie immediately |
| A4 | AUTH: verifiable bcrypt hash; identical passwords produce distinct salts/hashes |
| A5 | AUTH: short and >72-byte passwords rejected; multibyte boundaries/no truncation |
| A6 | SECURITY: every supported product/invoice method returns 401 without credentials, even malformed input |
| A7 | SECURITY: cross-user list/read/update/delete/transition/edit/reference blocked; SKU may repeat across users |
| A8 | ENV + DOCS: secrets required, placeholder rejected, .env ignored/example trackable, no public secrets |
| A9 | AUTH: wrong password and unknown email yield identical 401 body, no account details |
| I1 | PRODUCTS: owned create/read/update/delete succeeds, deleted excluded |
| I2 | PRODUCTS: case-insensitive name/SKU search, stable pagination/count, no overlapping pages |
| I3 | PRODUCTS: duplicate SKU, missing fields, negative/fractional money/stock, invalid pagination yield field errors |
| I4 | PRODUCTS + INVOICES: deletion preserves invoice; cannot select/issue deleted product; cancellation restores its stock |
| V1 | INVOICES: multi-line draft; empty/unknown/foreign/duplicate lines rejected |
| V2 | INVOICES + MONEY: exact computed totals; supplied totals/prices rejected; integer overflow tested |
| V3 | ENV + MONEY + INVOICES: default 11%, alternate rate, invalid env, persisted original rate |
| V4 | INVOICES: product changes leave invoice unchanged; draft edits retain snapshots, new lines use current data |
| V5 | INVOICES: overstock create/edit/issue rejected naming product, including intervening stock reduction |
| V6 | INVOICES: issue deducts all lines once; late failure rolls back deductions/status |
| V7 | INVOICES: issued cancel restores; draft cancel restores nothing; repeated cancel has no second effect |
| V8 | INVOICES: full transition matrix; terminal/repeated/illegal transitions return 409 |
| V9 | INVOICES: only draft items editable, totals recalculated, stock not reserved, stale version rejected |
| V10 | INVOICES: pagination/status filter and complete detail; foreign detail 404 |
| F1 | UI: register/login works, server errors visible |
| F2 | UI: product CRUD/search/pagination/empty state |
| F3 | UI: two-line creation, live totals equal saved totals, paginated selection |
| F4 | UI: filter/detail/draft-edit/issue/paid/cancel; separate invoices for terminal paths |
| F5 | UI: every dashboard page redirects fresh/expired/revoked visitors, no private content |
| F6 | UI: pending disables resubmit; API failure/error boundary shows retry not blank |
| N1 | DOCS + SEED: README documents actual commands; clean-clone rehearsal provides execution evidence |
| N2 | DOCS: example covers read variables with safe values and git ignore exception |
| N3 | SEED: empty PostgreSQL migration, seed twice, one demo/five products, login works, existing data unchanged |
| N4 | HARNESS + DOCS: IDs mapped, pnpm test propagates failures; mandatory five covered by A9/A6/V5/V6/V7 |
| N5 | DOCS + UI: OpenAPI 3.1 validates, operations/security/errors match handlers, Swagger loads spec |
| N6 | ERRORS + integration: consistent 400/401/403/404/409/422/500; invalid JSON; sanitized unexpected failure |
| N7 | DOCS: release git-history check for multiple meaningful commits; human incremental review, no fabrication |

Additional tests: concurrent same-invoice issue deducts once; competing drafts cannot oversell; concurrent cancellation restores once; edit/issue race yields serial outcome; stale product update cannot overwrite stock; cancellation overflow rolls back; retry exhaustion returns 409; HARNESS refuses dev/remote DB. Valid-auth missing/foreign-Origin mutations fail 403. Test invalid/leap-year dates and half-cent rounding. Unit suite needs no Docker; mock-only tests cannot prove atomicity.
## [Implementation Order]

**Execution amendment:** use stable task IDs T00–T10 and merged prerequisite gates in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and `/home/areion/projects/eterna-take-home/docs/execution/dependency-tree.md`. Task cards under `/home/areion/projects/eterna-take-home/docs/tasks/` supersede the older sequential milestone grouping below for scheduling/ownership, not business requirements. Workers follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md` and edit only owned files/their card; coordinator maintains central memory/plan/status. T01 owns Prisma-backed retry helper; it rethrows exhausted known conflicts for T02 error mapping, avoiding an unmerged cross-dependency. T00 owns schema-independent harness; T03 adds real auth fixtures. T04 tests auth foundation; T08/T09 verify their concrete protected pages after implementation. No fake feature placeholders for early tests. Shared dependencies are installed/frozen by T00; later changes require coordinated rework. Database/E2E tests serialize across worktrees. Agents create their own `<PRIMARY>/.worktrees/<task-id>-<slug>` on `task/<task-id>-<slug>` from origin/main; no primary-checkout edits/installs/tests. Coordinator publishes the `/.worktrees/` ignore rule before T00. All paths/commands target the feature worktree. After verified push and durable REVIEW handoff, the skill gates non-forced removal of only the agent's clean worktree, inspecting ignored artifacts and stopping owned processes first. Retain local/remote branches; preserve worktrees on conflicts, failures or uncertain state.


1. **Planning handoff (current task):** finalize plan/memory bank, verify structure/coverage, request separate coding approval. No automatic commits in documentation-only task.
2. **Infrastructure:** enable Docker WSL integration; pin dependencies; configure Prisma/PostgreSQL, shadcn and test harness. Write safety/env/money tests first, observe expected failures, implement helpers. Commit verified setup milestone.
3. **Database:** generate/check auth schema, domain models and constraints, generate client, migrate empty development/test PostgreSQL. Write seed integration test then idempotent seed. Document real commands.
4. **Authentication slice:** failing A1–A9/error/origin tests, then bcrypt/session/wrapper implementation. F1/F5 browser tests before login/register/layout/logout UI. Verify cookie forwarding and revocation.
5. **Products slice:** failing I1–I4/ownership/version tests, services/handlers, then F2 UI tests and UI. Validate actual PostgreSQL behavior.
6. **Invoice creation/edit:** failing V1–V5/V9/V10 money/snapshot/date/stock tests, then services/routes; F3/draft-edit tests before UI.
7. **Lifecycle:** failing V6–V8/rollback/concurrency tests, then atomic status/stock logic; F4 tests before actions UI. No optional ledger/features.
8. **Swagger/release docs:** failing documentation/spec checks, implement local Swagger/spec, finish README. Commit verified slices incrementally; N7 is a release check, not a prerequisite before history exists. Record actual commands/results in memory bank.
9. **Clean-clone verification:** disposable worktree, frozen pnpm install, copy env example/generate secret, db:up, db:generate, db:migrate, db:seed twice, install Chromium, pnpm test, lint, typecheck, build, start/manual smoke. Inspect diff/status/secret exclusions. Never replace PostgreSQL tests with SQLite/mocks to obtain green.
10. **Handoff:** update memory bank with implemented/pending scope, trade-offs, AI usage and user-supplied actual hours; summarize evidence. No deployment/push without request. Cut optional polish first if time-limited; explicitly disclose any unfinished core requirement.

Completion requires passing coverage for all 36 IDs, documented clean-clone functionality, PostgreSQL migrations/seed/atomicity verification, no real secrets, incremental history, lint/typecheck/build. Text/history checks supplement execution, not replace it.

Planning baseline (2026-09-18): starter pnpm lint passed; timeout-bound pnpm build passed, exit code 0. No application tests exist. Docker unavailable in WSL. Baseline checks do not validate planned business code. All new libraries/models remain proposed, not installed/generated.
