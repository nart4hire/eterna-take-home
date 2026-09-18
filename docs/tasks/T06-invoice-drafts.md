# T06 — Invoice drafts API

Status: IN_PROGRESS
Owner: T06 worker (`task/T06-invoice-drafts`)
Depends on: T05 (accepted and merged)
Requirement IDs: V1, V2, V3, V4, V5, V9, V10, A6, A7, N6
Branch / worktree / base SHA: `task/T06-invoice-drafts` / `<PRIMARY>/.worktrees/T06-invoice-drafts` (PRIMARY `/home/areion/projects/eterna-take-home`) / base `6002599` = `origin/main`
Accepted dependency revisions: T05 tip `d5eeaf3` (tested implementation `51ff472`, tested merge `6d05f4c`) — verified ancestor of `origin/main` `6002599` with `git merge-base --is-ancestor` before branching; T01 `a19d7c8`/`b801d3a`, T02 `fc14c2b`/`3f6a1d1` and T03 `bcad778`/`3e38219` are ancestors through T05's merge. `origin/main` did not advance during the task.

## Dependency cross-check: T04 (Playwright removal, container work)

T04 (`task/T04-ui-foundation`, still unreviewed at dispatch) carries **AMEND-T04-1**: Playwright and the entire browser layer are removed (`playwright.config.ts`, `@playwright/test`, `test:e2e`, the runner's `e2e` subset, the `next-e2e` lease, every `tests/e2e/**` file), the T04/T08/T09/T10 cards are amended to a manual reviewer checklist, and T04 adds `Dockerfile`/`.dockerignore`/`docker/**` plus a compose `app` service. Cross-check result at base `6002599`: **T04 does not block T06**.

- No path overlap: T04 changes UI/styles/client-helper files, dev/container files, T00-owned harness paths and central documents. T06 owns `lib/services/invoices.ts`, `app/api/invoices/**` and `tests/integration/invoices.test.ts`. T04 does not touch the T06 card or T06's graph entry, so neither merge order can produce a conflict on my owned paths.
- No requirement interaction: T06's IDs (V1–V5, V9, V10, A6, A7, N6) contain no UI (`F*`) or browser/harness IDs, and this card never referenced browser tests. Removing Playwright deletes no T06 coverage obligation.
- Harness compatibility: T06 uses `pnpm test unit` / `pnpm test integration` only. T04's `scripts/test.ts` edit changes the `e2e` subset branch and the suite suffix rule only; the unit fast path, the `postgres-test` Compose profile, `db:generate`, `db:migrate`, the destructive reset and the vitest invocation are unchanged, so this suite behaves identically before and after T04 lands.
- Container work is additive: T04 keeps the `postgres-test` profile on `127.0.0.1:5433/stockflow_test` and adds an `app` service, leaving the T06 lease target untouched.
- Unrelated observation, no action taken: T04's branch edits coordinator-owned documents (`docs/execution/dependency-graph.json`, `implementation_plan.md`, `.clinerules/memory-bank/*`, `.cline/skills/**`) and the T08/T09/T10 cards. This worker left every central document untouched and proposes the T06 graph/dashboard update in the handoff instead.

## Scope and ownership

Own T06 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan: invoice snapshots/money/drafts, Types, Functions. No status route, UI or product service changes. T07 may modify invoice service only after this task merges.

## Acceptance and test design

- Test valid multi-line draft; reject empty/duplicate/unknown/foreign/deleted references, excess stock, invalid dates and spoofed totals/price/ownership.
- Calculate exact bounded totals and snapshot current name/price/tax. Draft replacement retains existing-line snapshots; new lines get current product data; does not reserve stock. Snapshot survival after product edits tested.
- UUID-derived unique invoice number and valid dates; pagination/status filter/detail include expected data and stable owner scope.
- Draft-only versioned editing, atomic replacement and rollback on invalid line. Non-draft fixtures created via Prisma for rejection tests; status endpoint is T07, not a placeholder here.
- Parameterized auth/ownership/error tests in owned invoice test file cover each implemented method.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Create/list/detail/draft-item services and routes | IN_PROGRESS | `app/api/invoices/{route.ts,[id]/route.ts,[id]/items/route.ts}` staged as 501 red-stage handlers in the red-stage commit below; real handlers pending | None |
| Exact totals/snapshots/stock guard/version handling | IN_PROGRESS | Red suite in `tests/integration/invoices.test.ts` (27 cases for V1–V5/V9/V10/N6) | None |
| PostgreSQL draft/ownership/snapshot tests | IN_PROGRESS | `pnpm test integration` 27 failed | 81 passed (108) at red stage; 25 T01 + 27 auth + 4 seed + 25 products stayed green | Red stage commit (tests + stubs) |

## Validation

Acquire postgres-test lease; run invoice draft and money/product/auth regressions, lint/typecheck/build. Stock remains unchanged across successful draft operations and failed attempts. Do not claim lifecycle tests until T07.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record invoice DTO/items/version, retained snapshots, status filter and numbering.
Blockers: T05 not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge dispatch T07; relinquish invoice-service editing until coordinated rework.
Coordinator acceptance / merge SHA: Pending.
