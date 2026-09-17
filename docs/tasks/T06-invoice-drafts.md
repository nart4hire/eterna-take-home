# T06 — Invoice drafts API

Status: TODO
Owner: Unassigned
Depends on: T05
Requirement IDs: V1, V2, V3, V4, V5, V9, V10, A6, A7, N6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

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
| Create/list/detail/draft-item services and routes | NOT_STARTED | Not executed | None |
| Exact totals/snapshots/stock guard/version handling | NOT_STARTED | Not executed | None |
| PostgreSQL draft/ownership/snapshot tests | NOT_STARTED | Not executed | None |

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
