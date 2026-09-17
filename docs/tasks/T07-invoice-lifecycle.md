# T07 — Invoice lifecycle and atomic stock

Status: TODO
Owner: Unassigned
Depends on: T06
Requirement IDs: V5, V6, V7, V8, V9, I4, A6, A7, N6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

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
| Status service and endpoint | NOT_STARTED | Not executed | None |
| Atomic deductions/restoration/version guards | NOT_STARTED | Not executed | None |
| PostgreSQL lifecycle/rollback/concurrency tests | NOT_STARTED | Not executed | None |

## Validation

Acquire postgres-test lease; run lifecycle including controlled concurrent calls plus existing draft/product/auth regressions, lint/typecheck/build. Concurrency is inside one owned test run, not multiple resetting runners. No mock-only atomicity evidence.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record status/version request and 409 fields/message behavior for UI.
Blockers: T06 not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge T09 requires T04 also accepted.
Coordinator acceptance / merge SHA: Pending.
