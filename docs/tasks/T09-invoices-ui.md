# T09 — Invoices UI

Status: TODO
Owner: Unassigned
Depends on: T04, T07
Requirement IDs: F3, F4, F5, F6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

## Scope and ownership

Own T09 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read frontend contracts and invoice snapshot/state rules. No shared UI/API/schema/style edits. ProductPicker belongs here; independent of T08 product forms.

## Acceptance and test design

- Browser tests first for two-line creation, exact live/saved totals, required customer/dates, paginated product picker beyond first 100, duplicate-line prevention and server stock errors.
- Existing draft edits preserve snapshot prices and tax; send version, display server-authoritative totals when preview became stale.
- List/filter/pagination/detail expose snapshots/totals; legal issue/paid/cancel actions only, pending disabled, 409 handled with refresh. Separate invoices exercise paid/cancelled terminal paths.
- Every invoices page rejects fresh/expired/revoked visitors; own detail/edit only, draft edit guard. API errors/loading show useful retry, not blank content.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Invoice form/edit and paginated product picker | NOT_STARTED | Not executed | None |
| List/detail/status actions | NOT_STARTED | Not executed | None |
| Invoice browser/redirect/loading/error tests | NOT_STARTED | Not executed | None |

## Validation

Acquire postgres-test/next-e2e leases; real server invoice flows, existing API/browser regressions, lint/typecheck/build. Verify displayed totals against actual server response. Do not change stock/status rules to simplify UI.

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
