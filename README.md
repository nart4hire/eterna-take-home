# StockFlow

Inventory and invoicing for a small distributor who currently oversells while tracking stock and
invoices in spreadsheets. Each staff account gets its own products and invoices: products carry a
stock level and a price, invoices are drafted with snapshotted line prices, and issuing, paying or
cancelling one moves stock atomically.

Built with Next.js 16 (App Router), TypeScript, Tailwind v4, Prisma 7 with PostgreSQL, BetterAuth
(bcryptjs password hashing) and Zod. The full specification is `implementation_plan.md`, the
requirement-to-evidence ledger is `docs/requirements.md`, and the task cards under `docs/tasks/`
record how the work was sequenced and verified.

## Quick start (containers)

Needs Docker and a populated `.env`.

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"   # paste into BETTER_AUTH_SECRET
docker compose up --build
```

The `app` service builds the production bundle, runs `prisma migrate deploy`, applies the idempotent
demo seed and serves on <http://localhost:3000>. Register your own account, or sign in with the demo
credentials below. Stop with `docker compose down`; add `-v` to drop the database volume too.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm db:up        # PostgreSQL 17 on localhost:5432 (Compose service `postgres`)
pnpm db:migrate   # prisma migrate deploy
pnpm db:seed      # demo data; idempotent, never overwrites rows you changed
pnpm dev          # http://localhost:3000 — one process serves the pages and the API
```

`generated/prisma` is a build artifact and is not committed: `dev`, `build`, `typecheck` and both test
subsets generate the Prisma client on demand, so a clean checkout needs no manual generate step.

## Environment

`.env` is git-ignored; `.env.example` is tracked and contains local-only placeholders.

| Variable | Purpose | Local value |
|---|---|---|
| `DATABASE_URL` | Application connection string | `postgresql://stockflow:…@localhost:5432/stockflow` |
| `TEST_DATABASE_URL` | Isolated database for integration tests | `…@localhost:5433/stockflow_test` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose `postgres` service; keep in step with `DATABASE_URL` | `stockflow` / local-only / `stockflow` |
| `TEST_POSTGRES_PASSWORD` | Compose `postgres-test` service | local-only |
| `BETTER_AUTH_SECRET` | Session signing secret; a placeholder or a value under 32 characters is rejected at startup | generate your own |
| `BETTER_AUTH_URL` | Trusted origin **and** cookie host. Must match the origin and host string you actually open | `http://localhost:3000` |
| `TAX_RATE_BPS` | Default tax rate in basis points, `0`–`10000`; snapshotted on each new invoice | `1100` (11 %) |
| `NODE_ENV` | Standard Next.js mode | `development` |

## Demo credentials

| Email | Password |
|---|---|
| `demo@stockflow.local` | `StockFlowDemo!2026` |

The seed also creates five products (`DEMO-001` … `DEMO-005`) so invoice screens have something to
pick from. It only creates what is missing: edited prices, stock levels and soft deletions survive a
rerun. The seed refuses to run with `NODE_ENV=production`.

## API documentation

- **Specification (machine-readable):** `GET /api/openapi.json` — OpenAPI 3.1, built from the same
  Zod schemas the route handlers validate with, and served by the application itself.
- **Viewer (human-readable):** <http://localhost:3000/docs> — Swagger UI rendered from the locally
  installed `swagger-ui-dist` package. No CDN, no external validator and no session required.
- The viewer is **deliberately not linked from the client application**: the people who use StockFlow
  to bill customers are not the maintainers of its API, so no client screen advertises developer
  documentation. The URL is documented here instead.
- Automated coverage of the specification lives in `tests/unit/documentation.test.ts` (does the
  document validate, does it match the implemented handlers, statuses, error codes and security
  requirements, and does the client stay free of documentation links). Rendering the viewer is a
  manual reviewer-checklist item, because the project has no browser test suite by design.

## Tests

```bash
pnpm test             # both suites
pnpm test unit        # no database: money/validation/env/http/harness/documentation
pnpm test integration # real PostgreSQL, resets the isolated test database first
pnpm lint             # eslint
pnpm typecheck        # prisma generate && next typegen && tsc --noEmit
pnpm build            # prisma generate && next build
```

The runner pins `DATABASE_URL`, `TEST_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`TAX_RATE_BPS` and `NODE_ENV` for DB-backed children, refuses to run integration tests against the
development database, and does not tear the shared Compose services down. There is no browser suite:
UI behaviour is verified with the manual checklist in the task cards, and API behaviour with the
real-PostgreSQL integration suites.

## Behaviour worth knowing

- **Money** is integer cents everywhere, displayed as USD. There is no currency selection, and the
  API rejects client-computed prices or totals: `TAX_RATE_BPS` is snapshotted on each invoice and tax
  is rounded half-up exactly once.
- **Drafts** validate stock but never reserve it. Issuing deducts every line in one transaction (or
  none), and cancelling an issued invoice restores the stock exactly once. `PAID` and `CANCELLED` are
  terminal, so an illegal or repeated transition answers `409` without repeating a stock effect.
- **Snapshots:** a line stores the product name and unit price from when it was first added, so later
  product edits never rewrite an invoice. Soft-deleting a product keeps its SKU reserved and keeps
  existing invoices intact.
- **Ownership:** every read and write is scoped to the session's user. Another user's identifier
  answers `404` exactly like an unknown one, and request bodies never carry ownership.
- **Origin:** mutating requests must send an exact `Origin` header matching `BETTER_AUTH_URL`.
  Command-line clients need `-H 'Origin: http://localhost:3000'` plus the session cookie.
- **Concurrency:** products and invoices carry a `version`; writes are rejected with `409` when the
  value you read is stale, and every stock change increments the product version.

## Tech choices

- **Next.js App Router route handlers as the only backend.** Pages and API live in one deployable,
  which keeps the take-home small: no separate server, no CORS, no client-side data layer.
- **Prisma 7 + PostgreSQL** for real constraints (money, stock and version checks in the schema),
  serializable transactions for the stock effects, and migrations that are part of the repository.
- **Zod schemas shared by routes and forms.** One definition drives request validation, the query
  parsing and the published OpenAPI request bodies, so the documentation cannot drift from what the
  handlers accept.
- **BetterAuth with bcryptjs (cost 12)** for database-backed sessions: revocation and expiry take
  effect on the next request, and copied cookies stop working immediately after logout.
- **Integer cents end to end.** Prices are parsed digit-by-digit in the UI and stored as integers, so
  no float ever touches money or tax rounding.
- **Optimistic concurrency over locks.** A `version` guard on products and invoices is small, testable
  and enough for the overselling problem this app exists to solve.
- **Server-rendered pages with small client forms.** Validation, empty and error states live on the
  server where the data is, and only the interactive forms are client components.
- **Deliberately thin client helper** (`lib/client-api.ts`) instead of a data-fetching library: one
  typed fetch wrapper that maps API errors to form field errors.
- **Real-PostgreSQL integration tests** with an isolated Compose database, because atomicity and
  ownership claims cannot be proven with mocks alone.
- **Swagger UI from the installed package, not a CDN**, so the documentation surface works offline
  and never depends on a third party being reachable.


## Trade-offs and deliberate scope cuts

- The UI is **not test-driven**: the browser suite was removed on purpose, so screen behaviour is
  verified by manual checklists in the task cards while automated coverage stays on the unit,
  integration and documentation suites.
- Single currency with a fixed two-decimal scale; no multi-currency, no currency selection.
- No roles or teams: every user has an independent workspace, and there is no admin view.
- No stock ledger, no back-orders and no partial fulfilment — stock is a single integer per product.
- No password reset, email verification or OAuth; the demo seed exists so the app is usable at once.
- Invoice metadata cannot be edited after creation, and invoices are never deleted, only cancelled.
- Search is a literal case-insensitive substring match (wildcards are escaped), not a fuzzy search.

## With another week

- A stock ledger per product, so historic movements can be audited instead of only the current count.
- Metadata editing for drafts, plus an activity feed per invoice (who issued, paid or cancelled it).
- Customer records, so `customerName` becomes a real entity with its own history and contact data.
- Import/export (CSV) for products and invoice lines, which is how the spreadsheet users would move.
- Restoring a soft-deleted product, with the SKU reservation released deliberately.
- A second tax mode (per-line rate or tax-exempt customers) and an explicit rounding policy UI.
- Browser tests for the interaction rows that are manual today, once Chromium's dependencies can be
  installed in this environment.

## AI usage

The work was done with an AI assistant (Cline) driving implementation behind a task-card workflow
that a human reviewed and accepted:

- The specification in `implementation_plan.md`, the dependency graph in `docs/execution/` and the
  task cards in `docs/tasks/` were written first; each task was then implemented on its own branch in
  an isolated worktree, test-first, with the evidence recorded on its card.
- Every claim on those cards is a command plus a revision (`pnpm test unit`, `pnpm test integration`,
  `lint`/`typecheck`/`build`, HTTP checks) rather than a summary. Where a check could not be run — the
  browser phase, which was removed on purpose — the cards say so instead of implying coverage.
- The AI wrote application code, tests and documentation; the human set the scope, answered
  specification questions and verified the UI in a browser before accepting each task.
- Known limits were handled explicitly: generated code was reviewed against the plan, no requirement
  ID or time budget was invented, and a failing check was reported as failing rather than tuned away.

## Repository layout

```
app/            App Router pages, the (auth) and (dashboard) shells, and the API route handlers
components/     Client components and the shadcn-style UI primitives
lib/            Auth, HTTP/error mapping, money, validation schemas, services, the OpenAPI document
prisma/         Schema, migrations and the idempotent demo seed
tests/          unit/ (no database) and integration/ (real PostgreSQL) suites plus the harness
scripts/        test runner that pins the environment and guards the test database
docs/           task cards, execution graph, requirement ledger
docker/         container entrypoint (migrate, seed, serve)
```

## Troubleshooting

- `docker compose` reporting a permission error means your user cannot reach the Docker socket; add
  the user to the `docker` group, or on this machine prefix the command with `sg docker -c '…'`.
- Mutations answering `403 ORIGIN_REJECTED` mean `BETTER_AUTH_URL` does not match the origin **and
  host string** you opened (`localhost` and `127.0.0.1` are different origins). Change the URL you
  use or the variable, then restart.
- `pnpm test integration` needs the Compose `test` profile up (`docker compose --profile test up -d
  postgres-test`) and the shared test database free; it refuses to run against the development
  database by design.

