# T08 — Products UI

Status: TODO
Owner: Unassigned
Depends on: T04, T05
Requirement IDs: F2, F5, F6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

## Scope and ownership

Own T08 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read frontend Files and product contracts. Shared UI/styles/client helper/pagination and API are read-only. Can edit concurrently with invoice tasks; E2E runs serialized.

## Acceptance and test design

- Write browser tests first for create/edit/delete confirmation, search by name/SKU, next/previous pagination, empty results, server field errors and version conflict refresh.
- Product form parses decimal strings through shared money helper, sends integer cents/version. No floating currency arithmetic or client-only validation claims.
- Each products page independently requires session before loading owned data. Fresh/expired/revoked visitors redirect; foreign edit is not exposed.
- Delayed/failed API shows pending/error/retry, disables duplicate submission, preserves entered values. Accessible labels/table/buttons, no blank error states.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Products list/search/pagination/deletion UI | NOT_STARTED | Not executed | None |
| Create/edit forms and session checks | NOT_STARTED | Not executed | None |
| Product browser/redirect/loading/error tests | NOT_STARTED | Not executed | None |

## Validation

Acquire postgres-test and next-e2e leases; real-server products browser tests plus available regressions, lint/typecheck/build. API interception only for deterministic pending/error behavior, not happy-path data integrity. Shared changes require pause.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record final routes, accessibility/error behavior and any requested shared changes.
Blockers: Dependencies not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge T10 also requires T09.
Coordinator acceptance / merge SHA: Pending.
