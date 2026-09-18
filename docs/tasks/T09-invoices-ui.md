# T09 — Invoices UI

Status: TODO
Owner: Unassigned
Depends on: T04, T07
Requirement IDs: F3, F4, F5, F6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

> **Requirement amendment (user, 2026-09-18):** Playwright and the browser-suite layer were removed from the application (decision record on T04's card), so this card no longer owns `tests/e2e/invoices.spec.ts` and no browser phase exists in the test runner. UI verification is manual: the reviewer checklist published on T04's card is extended here with the invoice rows, while automated coverage stays on the API and regression side (T06/T07 integration suites plus lint/typecheck/build). T09 — together with T08 — is additionally authorized to touch the container files (`Dockerfile`, `.dockerignore`, the compose `app` service) where the container work needs changes for its screens.

## Scope and ownership

Own T09 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read frontend contracts and invoice snapshot/state rules. No shared UI/API/schema/style edits. ProductPicker belongs here; independent of T08 product forms. Database-backed suites still serialize on the shared test database.

## Acceptance and test design

- Write the API/integration cases that back these screens first where T06/T07 do not already cover them; the UI itself is not test-driven and is verified through the reviewer checklist rows below.
- Existing draft edits preserve snapshot prices and tax; send version, display server-authoritative totals when preview became stale.
- List/filter/pagination/detail expose snapshots/totals; legal issue/paid/cancel actions only, pending disabled, 409 handled with refresh. Separate invoices exercise paid/cancelled terminal paths.
- Every invoices page rejects fresh/expired/revoked visitors; own detail/edit only, draft edit guard. API errors/loading show useful retry, not blank content — reviewer-checklist items, since no browser suite exists.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Invoice form/edit and paginated product picker | NOT_STARTED | Not executed | None |
| List/detail/status actions | NOT_STARTED | Not executed | None |
| Invoices reviewer verification checklist rows | NOT_STARTED | Extends T04's manual checklist (two-line creation, live vs saved totals, picker beyond the first 100, stock errors, status filter/detail/actions); no browser suite exists | None |

## Validation

Acquire the postgres-test lease; run the API/regression suites the screens depend on plus lint/typecheck/build, and extend the container rehearsal if this task changed the container files. Verify displayed totals against the actual server response manually; record checklist results with the reviewer's browser and revision. Do not change stock/status rules to simplify UI.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record final routes/actions, stock conflict UX and provisional-total behavior.
Blockers: Dependencies not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge T10 also requires T08.
Coordinator acceptance / merge SHA: Pending.
