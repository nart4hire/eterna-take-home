# T07 — Invoice lifecycle and atomic stock

Status: REVIEW
Owner: T07 worker (`task/T07-invoice-lifecycle`)
Depends on: T06 (accepted and merged)
Requirement IDs: V5, V6, V7, V8, V9, I4, A6, A7, N6
Branch / worktree / base SHA: `task/T07-invoice-lifecycle` / `<PRIMARY>/.worktrees/T07-invoice-lifecycle` (PRIMARY `/home/areion/projects/eterna-take-home`) / base `ae380fd` = the `origin/main` at dispatch
Accepted dependency revisions: T06 tip `8c1a8d3` (tested code `898c219`, tested merge `f296093`) — `git merge-base --is-ancestor f296093 origin/main` succeeded on fetched `origin/main` `ae380fd` before this branch was created; T01–T05 are ancestors through T06's merges.

## Scope and ownership

Own T07 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read atomicity/status/soft-delete rules. Sequential ownership of invoice service follows merged T06; existing drafts test file remains read-only regression coverage.

## Acceptance and test design

- Write full status matrix tests first: DRAFT->ISSUED/CANCELLED, ISSUED->PAID/CANCELLED only, repeated/terminal/illegal actions 409 and no repeated stock effects.
- Serializable guarded status/version and sorted product quantity updates; all succeed or all roll back. Issue rechecks stock/deleted products; cancellation restores issued stock only, including soft-deleted rows. Product version increments on every stock change.
- Real DB race tests: same invoice issue once; competing drafts cannot oversell; cancellation restores once; edit/issue serial outcome; stale manual product write rejected. Rollback after late-line failure and overflow cancellation verified.
- Status endpoint authentication/ownership/origin errors tested, draft item immutability after transition proven.
- Retry helper/Prisma schema/product service are read-only; needed changes pause for coordinated prerequisite rework.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Status service and endpoint | VERIFIED | `lib/services/invoices.ts` adds `transitionInvoice`/`assertTransition` plus the private `deductStock`/`restoreStock`/`sortByProduct` helpers and `LEGAL_TRANSITIONS`; `app/api/invoices/[id]/status/route.ts` `PATCH` is `runtime = "nodejs"`, authenticates before parsing, checks the exact Origin, rejects a malformed path id (422) and a non-strict body (422), and returns the detail DTO with `no-store`; the build route table lists `ƒ /api/invoices/[id]/status` | `bf77585` (route/service), `ce9c2ab` (re-verified) |
| Atomic deductions/restoration/version guards | VERIFIED | The conditional `updateMany` on owner+current status+version is the race-safe state claim; deductions run in product-id order with `deletedAt: null, quantityOnHand >= qty` guards, restores with an `<= MAX_STOCK - qty` bound and no active-product filter (so soft-deleted lines are restored); any failed line throws, rolling the claim and every earlier write back; each stock change increments the product version, and an overflowing restore answers `409 STOCK_OVERFLOW` | `bf77585` |
| PostgreSQL lifecycle/rollback/concurrency tests | VERIFIED | `tests/integration/invoice-lifecycle.test.ts` — 25 cases (V8 ×3, V6 ×4, V5, V7 ×4, V9/I4 ×3, A6/A7 ×2, N6 ×4, concurrency ×4) against real PostgreSQL, real BetterAuth sessions and the exported route handlers; whole suite `pnpm test integration` `136 passed (136)` in three consecutive runs on this revision (plus one earlier 135-passing pair) | `ce9c2ab` |

## Validation

Lease: the coordinator granted the `postgres-test` lease (127.0.0.1:5433/stockflow_test) for T07 in this session, and the coordinator also ruled on the transition error contract (option 2). Only that database was used; the pre-existing `stockflow-postgres-test-1` container was reused and left running, and every database command was wrapped in `sg docker -c` because Docker is reachable only that way here. No other worktree, lease or process was touched: the two live `next dev` servers belong to other agents (T08-review on :3100 and the T06 review worktree on :3101, both on the dev database), T07 starts no server because it has no UI scope, and no shared Compose service was stopped. All five runs below executed inside this worktree as part of one owned serialized runner.

Red then green (every command in `<WT>`, `<WT>` = `/home/areion/projects/eterna-take-home/.worktrees/T07-invoice-lifecycle`):

- Red at `923a244` (suite + 501 status stage): `sg docker -c 'pnpm test integration'` → exit 1, `Test Files 1 failed | 5 passed (6)`, `Tests 24 failed | 111 passed (135)`, `invoice-lifecycle.test.ts (24 tests | 24 failed)`. Every failure is behavioral (`expected 501 to be 200/409/401/403/404/400/422` plus the downstream status/version/stock assertions) rather than an import or config error, and the T01/auth/seed/products/draft-invoice suites stayed green.
- Green at `bf77585` (implementation + first contract tweak): `sg docker -c 'pnpm test integration'` → exit 0, `Test Files 6 passed (6)`, `Tests 135 passed (135)` with `invoice-lifecycle.test.ts (24 tests)`.
- Second green at the same revision (`bf77585`) to re-roll the four nondeterministic races → exit 0, `Tests 135 passed (135)`.
- Third green at `ce9c2ab` (the immutability case added, 25 lifecycle cases) → exit 0, `Tests 136 passed (136)`.
- Fourth green at `ce9c2ab` after the explicit main integration → exit 0, `Tests 136 passed (136)`.

Post-integration gate set at `ce9c2ab` (all inside the worktree):

| Gate | Command | Result |
|---|---|---|
| Integration (`origin/main`) | `git -c pull.ff=false -c pull.rebase=false pull --no-rebase --no-edit origin main` | `Already up to date.`, exit 0 — `origin/main` is still `ae380fd`, the branch base, so no merge commit was created |
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Unit | `pnpm test unit` | exit 0 — 8 files, `Tests 79 passed (79)`, no T00–T06 regression |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, 0 `error TS` lines (self-generates the Prisma client) |
| Build | `pnpm build` | exit 0 — route table lists `ƒ /api/invoices`, `ƒ /api/invoices/[id]`, `ƒ /api/invoices/[id]/items`, `ƒ /api/invoices/[id]/status` |
| Integration (final) | `sg docker -c 'pnpm test integration'` | exit 0 — 6 files, `Tests 136 passed (136)` |

Behavior proven by execution, not by reading code: stock rows are byte-identical after every rejected transition; a two-line issue whose second line fails leaves both quantities and the status untouched; two concurrent issues of one invoice produce exactly one deduction; two drafts holding the last stock produce one issued invoice and one `INSUFFICIENT_STOCK`, never a negative quantity; two concurrent cancellations restore once; an edit racing an issue leaves a coherent single-winner state; a stale manual product write is rejected instead of overwriting a deducted quantity.

## Handoff

Completed: all three deliverables — the version-guarded, stock-atomic lifecycle service and its `PATCH /api/invoices/[id]/status` route, and the 25-case real-PostgreSQL lifecycle/rollback/concurrency suite — verified at `ce9c2ab`.
Remaining: nothing for T07. T09 consumes the status endpoint and the contract notes below; T10 documents them in the OpenAPI spec and `docs/requirements.md`.
Red/green commands/results: red `sg docker -c 'pnpm test integration'` at `923a244` → exit 1, `24 failed | 111 passed (135)` with `invoice-lifecycle.test.ts (24 tests | 24 failed)`; green at `bf77585` → exit 0, `135 passed (135)` (twice, re-rolling the races); green at `ce9c2ab` → exit 0, `136 passed (136)` (twice, the second after the main integration). Also `pnpm test unit` 79/79, `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0 with the new route in the table.
Implementation/tested SHA; integrated main SHA: `923a244` (red pin), `bf77585` (implementation), `ce9c2ab` (tested code revision, adds the post-transition immutability case); integrated main `ae380fd` = the branch base — the explicit `pull --no-rebase --no-edit origin main` reported `Already up to date`, so no merge commit exists and `ce9c2ab` is also the latest-main revision.
Uncommitted work: none (clean tree; `.env`, `generated/`, `.next` and `node_modules` are ignored local artifacts).
Contract notes: recorded in the section below for T09/T10.
Blockers: none. T07's two decisions that needed a ruling (transition message, `postgres-test` lease) were resolved by the coordinator in this session; everything else followed the merged T06 contract.
Push/PR status: pushed to `task/T07-invoice-lifecycle` as the commit that carries this line; verify with `git ls-remote --exit-code origin refs/heads/task/T07-invoice-lifecycle` and compare against the chat report. No pull request and no main merge attempted or authorized.
Next action: coordinator review, then acceptance and the `--no-ff` main merge on explicit user approval. T09 requires T07 accepted and T04 accepted; this worker relinquishes `lib/services/invoices.ts` only after acceptance.
Coordinator acceptance / merge SHA: Pending — not requested, not authorized.
Proposed central updates (coordinator-owned, not edited here): add a `T07` acceptance record to `docs/execution/dependency-graph.json` on merge and mark T07 DONE in the dashboard; the dependency guide's "T07 is eligible" wording can become "T07 accepted, T09 eligible behind T04". No plan/graph/skill/memory-bank file was modified by this worker.

## Contract notes (for T09/T10)

- Route: `PATCH /api/invoices/[id]/status`, body `{ version, status }` with `status ∈ ISSUED | PAID | CANCELLED` (strict object, so `DRAFT`, unknown statuses and extra keys are 422), response `200` + the same detail DTO as `GET /api/invoices/[id]` with `cache-control: no-store`; `userId`/`deletedAt` are never serialized.
- Status codes: 401 unauthenticated before any parsing (even with a malformed id or body); 403 missing/foreign Origin on an authenticated mutation; 404 unknown or foreign invoice; 409 for every state conflict; 422 schema/path validation; 400 `INVALID_JSON`.
- 409 conflicts: `INVOICE_NOT_EDITABLE` for an illegal or repeated transition with the message `Invoice status cannot change from <FROM> to <TO>` (coordinator ruling of 2026-09-18 on T06 item 5); `VERSION_CONFLICT` for a stale `version` on a legal transition; `INSUFFICIENT_STOCK` when an issue no longer covers a line (message `Only <available> of <name> are in stock`, field `items.<position>.quantity`); `STOCK_OVERFLOW` when a cancellation restore would exceed the 1,000,000 stock bound (message only); `TRANSACTION_CONFLICT` from T02's mapper on retry exhaustion.
- Evaluation order: existence → state → version, so an illegal transition reports the state conflict even with a stale version, while a legal transition with a stale version reports `VERSION_CONFLICT`. T09 should refresh the invoice on any 409.
- Issue-time references: a line whose product was soft-deleted answers 404 `NOT_FOUND` with `fields["items.<position>.productId"]` (the invoice has to drop or replace that line), while a reduced quantity is a 409 naming the product and its live stock.
- Effects: issue deducts each line once and increments the invoice version; an issued cancellation restores each line once (soft-deleted products included) and increments the version again; draft cancellation and PAID never move stock beyond the single documented deduction. Transitions never rewrite snapshots or totals.
- Race outcomes: the loser of a concurrent transition may answer `VERSION_CONFLICT`, `INVOICE_NOT_EDITABLE` or `TRANSACTION_CONFLICT` — all 409, and none repeats a stock effect. UI copy should therefore use generic "the invoice changed; reload" wording for 409.

## Disclosed decisions and limitations

- `409 STOCK_OVERFLOW` is a new code because the plan mandates a 409 for a cancellation overflow but names no code. It carries a message only: no request field can fix it, since the manual stock write has to be lowered before the cancellation can succeed, and the invoice stays `ISSUED`.
- The issue-time `INSUFFICIENT_STOCK` 409 names the product's current name and current quantity (not the line's snapshot), matching T06's create/edit behaviour, and uses the line `position` as the field index.
- A soft-deleted product line is 404 at issue time (consistent with T06's nested-reference rule) while a reduced quantity is 409; both leave the draft untouched and still editable.
- The status response is the full detail DTO so T09 can re-render the page without a second request; the shape is byte-compatible with `GET /api/invoices/[id]`.
- Not exercised, and reported as such rather than as passed: a sanitized 500 on the status path (no reachable trigger without mocking; T06's equivalent came from the create path's env read) and retry-exhaustion `TRANSACTION_CONFLICT` (covered by T01/T02 unit tests only, as T06 disclosed).
- Read-only and unchanged: `lib/services/products.ts`, `lib/services/transaction.ts`, `prisma/schema.prisma`, T06's `tests/integration/invoices.test.ts` and every T00–T06 route. `git diff --stat ae380fd ce9c2ab` touches only `lib/services/invoices.ts`, the new status route, the new lifecycle suite and this card.
