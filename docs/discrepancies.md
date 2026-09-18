# Discrepancy log — `project.md` / plan vs. the delivered code

Purpose: while building [`tech_spec.md`](../tech_spec.md) by independent discovery, everything that did
not line up — with `project.md`, with `implementation_plan.md`, with the task cards or with the graph —
was written down here instead of being silently reconciled. Reviewed and produced during T10
(2026-09-18) on the merged revision of `main` after T09 was accepted.

**Severity** — `cosmetic` (wording/docs only, no behaviour difference), `documentation` (a real gap in
what is written where), `behaviour` (code and requirement genuinely differ), `process` (release/
verification discipline). **Disposition** — `recorded` (nothing to change, kept as an honest note),
`fixed in this branch` (T10 changed it), `left to the human` (README authorship was deliberately
reserved for the author).

| # | Severity | Finding | Disposition |
|---|---|---|---|
| D1 | cosmetic | `project.md` §4.3 sketches `invoiceNumber` as "e.g. INV-2026-0001" (sequential-looking). The implementation generates `INV-<UTC year>-<invoice uuid>` (`lib/services/invoices.ts` `generateInvoiceNumber`) on purpose, because `count + 1` collides under concurrent drafts. The deviation is documented in the code comment and the OpenAPI description, but **not in the README**. | recorded; README line flagged for the author |
| D2 | behaviour | **The bonus "rate limiting on the login endpoint" is only half true.** The app configures no limiter: it inherits BetterAuth's, and BetterAuth sets `enabled: options.rateLimit?.enabled ?? isProduction` (`node_modules/better-auth/dist/context/create-context.mjs`, window 10 s / max 100) — so under `pnpm dev` (`NODE_ENV=development`) the login route is **not** rate limited, and only the container / `next start` path is. There is no test, the README does not claim it, yet the OpenAPI document does advertise `429 RATE_LIMITED` for login/register (accurate for production). | recorded; the author should claim it with that caveat or drop it |
| D3 | documentation | `implementation_plan.md` §5 "Requirement-to-test matrix" lists file keys (AUTH, PRODUCTS, INVOICES, SECURITY, MONEY, ENV, HARNESS, DOCS, ERRORS, SEED, UI) that do **not** resolve to five test files which actually carry requirement evidence: `tests/integration/database.test.ts` (I3/I4/V6/N1), `tests/unit/validation.test.ts` (A5/I3/V2/N6), `tests/unit/transaction.test.ts` (V6), `tests/unit/environment-example.test.ts` (A8/N2) and `tests/unit/client-api.test.ts` (F1-adjacent). The plan's trailing sentence ("additional foundation files/tests are owned explicitly in the dependency graph") covers the gap, and the graph's per-task `owns` lists do contain them. | recorded; `tech_spec.md` and the ledger cite the real files |
| D4 | process | The matrix labels **N7** `DOCS`, the same key as the automated `tests/unit/documentation.test.ts`, but that file asserts nothing about git history: the "release git-history check" is a manual step. Nothing is missing from the product; the label is misleading. | recorded; performed manually in the release rehearsal and recorded in the ledger |
| D5 | process | T04's card (checklist row C3) and T09's card (row D5) instruct T10 to keep F1's logout row, F5's "every dashboard page" row and the loading/error boundaries as **"not exercisable"** rather than "passed". T08/T09 later added the dashboard pages, so F5's per-page redirect row *is* now exercisable and was checked off in the user's browser passes, while the boundaries still cannot be triggered on purpose. | recorded; the ledger words each F row individually (exercised / not exercisable) instead of copying one blanket status |
| D6 | documentation | The delivered `README.md` (T10's slice) deliberately leaves out the honest hour count (`project.md` §9.2), a short endpoint table (optional — Swagger is the chosen N5 option and both URLs are linked), the bonus claims, the invoice-number decision (D1) and the assumptions list. | left to the human — the release was explicitly closed with the README's final pass reserved for the author |
| D7 | cosmetic | `project.md` §4.2 writes `unitPrice money, >= 0`; the delivered API/DB stores **integer cents** in `Int` columns and returns the same integers as `unitPrice` in the DTOs. That follows §4.3's money rule rather than contradicting it, but a reader of the table could expect a decimal type. | recorded; stated in the README's behaviour notes and the OpenAPI schema descriptions |
| D8 | cosmetic | The graph lists `F5`/`F6` under three tasks (T04, T08, T09) and `V5`/`V9`/`I4`/`A6`/`A7`/`N6` under two. That is the shared shell/guard/contract being extended per screen, not duplicate ownership; the ledger attributes evidence per row. | recorded; no change |
| D9 | cosmetic | `project.md` §2 allows one or two folders and requires a Node.js server; StockFlow runs pages and API in **one** Next process (no separate backend folder). | recorded; documented in the README |
| D10 | documentation | `project.md` §6 lists seven bonus items. Only the container one is delivered end to end (`clone → env → docker compose up`, rehearsed here); rate limiting is inherited (D2) and the rest (refresh-token rotation, roles, stock ledger, invoice PDF, CI, deployed URL, E2E) are absent — the README mentions none of them. | recorded; author decides what to claim |
| D11 | **behaviour (release-blocking, found by this rehearsal)** | **A fresh clone could not run the documented local workflow.** `generated/prisma` is git-ignored and only `build`/`typecheck`/the test runner generated it, so after `git clone` + `pnpm install`: `pnpm db:seed` died with `Cannot find module '@/generated/prisma/client'` (tsx evaluates `prisma/seed.ts`), and `pnpm dev` answered **HTTP 500** on `/login` with `Module not found: '@/generated/prisma/client'` (Turbopack compiling `lib/prisma.ts`), while the README promised "a clean checkout needs no manual generate step". The container path was unaffected (the image runs `pnpm build`). | **fixed in this branch**: `dev`, `db:migrate` and `db:seed` now run `prisma generate` first (`package.json`), pinned by harness test `T00-H27` in `tests/unit/test-harness.test.ts` (red: `1 failed | 25 passed`, green: `26 passed`) and re-verified by re-running the whole rehearsal from a second fresh clone |


- All 36 numbered IDs are implemented, and each of the 29 non-UI IDs has at least one automated test
  whose title names the ID (see `tech_spec.md`). The mandatory five in N4 map to A9, A6, V5, V6 and V7,
  exactly as `implementation_plan.md` predicted.
- Money is integer minor units end to end (Postgres `Int` columns, `lib/money.ts`, digit-wise parsing
  in the UI), including the SQL invariant `lineTotal = unitPrice * quantity` and the non-negative
  CHECK constraints.
- Stock effects match §4.3: `DRAFT → ISSUED` deducts every line atomically, `ISSUED → CANCELLED`
  restores exactly once, `PAID`/`CANCELLED` are terminal, drafts reserve nothing, and every write runs
  in a serializable transaction with a three-attempt bound.
- Ownership scoping, 401-before-input, exact-`Origin` enforcement on mutations, sanitized 500s,
  `cache-control: no-store` and the `{ error: { code, message, fields? } }` envelope match §4.1
  A6/A7/A9 and §5 N6.
- Soft delete keeps invoices readable, reserves the SKU, blocks selecting or issuing a deleted product,
  and still restores its stock on cancellation (§4.2 I4).
- The client application exposes no developer documentation (AMEND-T08-1) while
  `GET /api/openapi.json` and the standalone `/docs` viewer exist, and the document covers the merged
  API surface exactly (11 paths, 15 operations — enforced by `tests/unit/documentation.test.ts`).
- `project.md`'s out-of-scope list (§7) is respected: no payment, multi-currency, purchase-order,
  email, password-reset, OAuth, real-time, multi-tenant or design-system code or dependency exists.

