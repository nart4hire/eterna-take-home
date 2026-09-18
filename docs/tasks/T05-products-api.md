# T05 — Products API

Status: REVIEW
Owner: T05 worker (`task/T05-products-api`)
Depends on: T03 (accepted and merged)
Requirement IDs: I1, I2, I3, I4, A6, A7, N6
Branch / worktree / base SHA: `task/T05-products-api` / `<PRIMARY>/.worktrees/T05-products-api` (PRIMARY `/home/areion/projects/eterna-take-home`) / base `14e8b71` = `origin/main`
Accepted dependency revisions: T01 tip `a19d7c8` (merge `b801d3a`), T02 tip `fc14c2b` (merge `3f6a1d1`), T03 tip `bcad778` (merge `3e38219`) — all verified ancestors of `origin/main` `14e8b71` with `git merge-base --is-ancestor` before branching; `origin/main` did not advance during the task.

## Scope and ownership

Own T05 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan: product routes/services, validation/soft-delete/version rules. No shared schemas/helpers or UI edits. Endpoint ownership tests live in products.test.ts, not a shared authorization file.

## Acceptance and test design

- Failing tests first for owned CRUD, case-insensitive name/SKU search, stable pagination/counts and empty results; required/invalid fields and unique normalized SKU yield specified field errors.
- Every supported method returns 401 before malformed-body parsing without credential; foreign IDs return 404; client ownership rejected; same SKU valid across users.
- Product mutation uses version guard; stale update/delete 409. Soft-delete retains SKU/reference, normal reads exclude deleted products.
- For referenced-delete test use an owned invoice fixture via Prisma, not nonexistent invoice HTTP routes. T07 verifies later cancellation/issue consequences.
- Use stable response DTOs/errors, exact integer prices, nonnegative stock, nodejs runtime and no-store responses.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Product service/routes and CRUD/search/pagination | VERIFIED | `lib/services/products.ts` (`listProducts`/`getProduct`/`createProduct`/`updateProduct`/`deleteProduct`), `app/api/products/route.ts` (GET/POST), `app/api/products/[id]/route.ts` (GET/PATCH/DELETE); integration 19/19 in `tests/integration/products.test.ts` | `66898aa` |
| Validation/version/soft-delete handling | VERIFIED | 422 field errors from the T02 strict schemas (query strings parsed with `productListSchema`, so unknown keys fail too), 404 for unowned/absent/deleted ids, 409 `DUPLICATE_SKU`/`VERSION_CONFLICT`, soft delete sets `deletedAt` + version, keeps the SKU reserved and the invoice item row intact | `66898aa` |
| Real endpoint authentication/ownership/regression tests | VERIFIED | `tests/integration/products.test.ts` 19 tests (A6/A7/I1/I2/I3/N6 + the I4 reference case) against real PostgreSQL, real BetterAuth sessions and the exported route handlers; whole suite `pnpm test integration` 75/75 (25 T01 + 27 auth + 4 seed + 19 products), exit 0 | `66898aa` |
| Review-rework: literal search + reviewer-found regressions | VERIFIED | `escapeLikePattern` in `lib/services/products.ts` (lines 46-50, applied at line 53) escapes `\`, `%`, `_`; six new cases in `tests/integration/products.test.ts` (`I2` literal search at line 448, `I3 N6` SKU/boundary regressions at line 468); red `89f7ef0` (1 failed/80 passed) → green `51ff472` (integration 81/81, unit 67/67, lint/typecheck/build 0) | `51ff472` |

## Validation

Lease: the coordinator granted the `postgres-test` lease for T05 (`127.0.0.1:5433/stockflow_test`). The pre-existing Compose service was used as-is and left running; Docker is only reachable via `sg docker -c` in this session, so every DB command was wrapped that way. No other agent's worktree/process/lease was touched.

Commands and results (all run in the worktree; tested revision `66898aa` unless noted):
- `pnpm install --frozen-lockfile` → exit 0 (T00 dependencies only; no manifest/lockfile change).
- Red at red-stage revision `e69450e` (tests plus temporary 501 handlers): `sg docker -c 'pnpm test integration'` → exit 1, `Test Files 1 failed | 3 passed (4)`, `products.test.ts` 19/19 failing with `AssertionError: expected 201/204/401/409/422 to be 501` while T01/auth/seed remained 56/56 green. This is behavioral red, not an import/module-resolution failure.
- Green at `66898aa`: `sg docker -c 'pnpm test integration'` → exit 0, `Test Files 4 passed (4)`, `Tests 75 passed (75)` (25 T01 + 27 auth + 4 seed + 19 products) on real PostgreSQL.
- `pnpm test unit` → exit 0, 7 files, 67/67 (no T00/T02 regression).
- `pnpm lint` → exit 0; `pnpm typecheck` → exit 0 (self-generates the Prisma client); `env -u NODE_ENV pnpm build` → exit 0 with the route table `ƒ /api/products` and `ƒ /api/products/[id]` (T03's exported-`NODE_ENV` build caveat does not apply here).
- Version handling is proven by execution, not a manual click-through: a second PATCH with the same version returns 409 `VERSION_CONFLICT` and leaves `name`/`version` unchanged, and two concurrent same-version PATCHes yield exactly one 200 plus one 409 with the stored `version` at 1. Deletion retention asserts the real `InvoiceItem` row and its snapshots survive the soft delete while the product disappears from reads.

Post-review rework (coordinator-authorized after the clean review, see `agent_explanations/T05.md` sections 7-8):
- Clean-review gates at `672ef46` in the reviewer worktree `.worktrees/T05-review` reproduced the numbers above exactly: integration 75/75, unit 67/67, lint/typecheck/build 0. Static audit: the diff against `14e8b71` is exactly five paths with no shared-contract, manifest, lockfile or config edits.
- Six adversarial probes (throwaway file, deleted afterwards) found one deviation: an unescaped `%` in `search` acted as a LIKE wildcard and returned every product.
- Red at `89f7ef0` (tests committed, pre-fix service restored): `sg docker -c 'pnpm test integration'` → exit 1, `Tests 1 failed | 80 passed`, `AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]` on `I2: search treats LIKE metacharacters as literal text`. The five migrated probe cases passed immediately, characterizing behaviour that was already correct.
- Green at `51ff472`: `sg docker -c 'pnpm test integration'` → exit 0, `Test Files 4 passed (4)`, `Tests 81 passed (81)` (25 T01 + 27 auth + 4 seed + 25 products) on real PostgreSQL; `pnpm test unit` → exit 0, 7 files, 67/67; `pnpm lint` → 0; `pnpm typecheck` → 0; `env -u NODE_ENV pnpm build` → 0 with the same route table including `ƒ /api/products/[id]`.
- Suite growth: 19 → 25 product cases. The five probe behaviours plus the literal-search case are now committed regression tests, and the throwaway probe file no longer exists, so no reviewer-only test remains.

## Handoff

Completed: all three deliverables — `lib/services/products.ts` (owner-scoped `listProducts`/`getProduct`/`createProduct`/`updateProduct`/`deleteProduct`), both route handlers (`app/api/products/route.ts` GET/POST, `app/api/products/[id]/route.ts` GET/PATCH/DELETE) and 25 real endpoint tests in `tests/integration/products.test.ts` (19 authored, 6 added in the review rework). Search is a literal case-insensitive substring: `\`, `%` and `_` are escaped before the `contains` filter. Remaining: nothing inside T05 scope. F2 product UI belongs to T08; the deleted-product consequences for invoice issue/cancel belong to T07.
Red/green commands/results: see Validation — red `e69450e` (`pnpm test integration` exit 1, products 19/19 behavioral failures, existing 56 still green); green `66898aa` (`pnpm test integration` exit 0, 75/75; `pnpm test unit` 67/67; lint/typecheck/build 0); rework red `89f7ef0` (1 failed/80 passed on the literal-search case); rework green `51ff472` (`pnpm test integration` exit 0, 81/81; `pnpm test unit` 67/67; lint/typecheck/build 0).
Implementation SHA: `51ff472` (authored implementation `66898aa`, red-stage tests/skeleton `e69450e`, review-rework tests `89f7ef0`, review record `314bd07`). Tested SHA: `51ff472`. Integrated main SHA: `14e8b71` — `origin/main` never advanced, so the branch is a direct child of it and no integration merge was required; `git fetch` was repeated before each push.
Uncommitted work: none; the worktree was clean at the final revision.
Contract notes (for T06/T08/T09/T10 and the OpenAPI spec):
- `GET /api/products?page&pageSize&search` → 200 `{ data: ProductDto[], pagination: { page, pageSize, total, totalPages } }` with `cache-control: no-store`. The list response is the flat `Page` envelope, not `{ data: { data, pagination } }`; `dataResponse` remains the wrapper for single resources. Defaults page 1 / pageSize 20 / search ""; pageSize max 100; empty result → `data: []`, `totalPages: 0`. `search` is trimmed and matches name OR SKU case-insensitively as a **literal** substring — LIKE metacharacters (`\`, `%`, `_`) are escaped, so searching `%` matches only rows that literally contain one (`lib/services/products.ts:46-50`).
- Ordering is always `createdAt` DESC then `id` ASC; `total` counts the identical owner+search filter; soft-deleted rows are excluded from data and totals.
- `ProductDto` = id, sku, name, description, unitPrice, quantityOnHand, version, ISO `createdAt`/`updatedAt`; `userId`/`deletedAt` never leave the service.
- `POST /api/products` (201) body = sku/name/unitPrice/quantityOnHand + optional description; `PATCH /api/products/[id]` (200) body = `version` plus at least one of sku/name/description/unitPrice/quantityOnHand (`description: null` clears it); `DELETE /api/products/[id]` (204, empty body) requires JSON `{ "version": n }`.
- Error contract: 401 `UNAUTHORIZED` before any parsing; 403 `ORIGIN_REJECTED` for mutations whose `Origin` is missing or not exactly `BETTER_AUTH_URL` (checked after auth, before parsing); 400 `INVALID_JSON` for non-JSON/malformed bodies; 404 `NOT_FOUND` for well-formed but unknown, unowned or soft-deleted ids; 409 `DUPLICATE_SKU` with `fields.sku` and 409 `VERSION_CONFLICT`; 422 `VALIDATION_ERROR` with `fields` (including unknown body/query keys).
- Documented decision: a path id that is not a UUID returns 422 `VALIDATION_ERROR` with `fields.id` (T02's `domainIdSchema` treats it as invalid input) — never 404 — while a valid-but-unowned UUID is 404, so ownership stays hidden. Uppercase UUIDs are accepted and normalized to lowercase.
- Versioning: `create` → version 0; `update`/`delete` increment it by 1; all product writes run through T01's `withSerializableRetry`, so a concurrent writer either retries and sees the new version (409) or fails the conditional update (409). A soft-deleted row keeps its `sku`, so recreating that SKU (any case/whitespace variant) is 409; no restore path exists.
- Service exports intended for T06/T07 reuse: `listProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct` — all take `userId` first.
Proposed central updates (coordinator-owned, not edited here): record T05 acceptance/merge in `docs/execution/dependency-graph.json` `acceptance_records`, refresh the `docs/execution/dependency-tree.md` status paragraph and the memory-bank dashboard, and note for T10 that list endpoints use the flat `Page` envelope and that malformed path ids are 422.
Blockers: none. Limitations: `pnpm exec vitest` outside the runner still fails closed by design (harness guard); there is no E2E/F2 UI evidence yet (T08) and no invoice issue/cancel evidence for deleted products yet (T07); N6's sanitized-500 path remains covered by T02's `tests/unit/http.test.ts` rather than a new product-endpoint case; `findMany` and `count` are two statements outside a transaction, so `total` can disagree with `data` by one under a concurrent write. Open decisions for the coordinator, recorded above for T10: malformed path id returns 422 rather than 404, and DELETE requires a JSON body.
Push/PR status: all four commits pushed to `origin/task/T05-products-api` with the remote SHA verified against local HEAD before the merge; the merge to `main` is performed by the coordinator/reviewer with `--no-ff` and the merge tree verified equal to the tested revision. The branch is retained after the merge.
Review record: `agent_explanations/T05.md` (walkthrough, requirement-to-test map, clean-review gates, probe results, F1 fix and the remaining contract decisions).
Next action: coordinator review, acceptance and serialized merge; T06 becomes eligible only after that, T08 additionally needs T04.
Coordinator acceptance / merge SHA: Pending.
