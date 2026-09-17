# T04 — UI foundation and authentication screens

Status: TODO
Owner: Unassigned
Depends on: T03
Requirement IDs: F1, F5, F6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

## Scope and ownership

Own T04 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan: frontend Files, Next conventions, auth UI. Can edit alongside T05. Do not create product/invoice pages or modify dependency manifests.

## Acceptance and test design

- Write auth browser/client-api tests first; register/login display server errors, logout revokes before redirect, pending/failed mutations stay usable.
- Generate selected shadcn components using installed dependencies only; system fonts, Tailwind v4 tokens, labels, alerts, shared pagination and client API helper.
- Root redirect/authenticated layout use real sessions, no proxy-only authorization. Async Next params/headers handled correctly. Shared errors/loading/not-found boundaries and metadata functional.
- Product/invoice routes are later tasks: do not assert nonexistent pages return protected content or invent temporary pages. Test session/client guard behavior here; T08/T09 own concrete route redirect tests.
- UI generators needing new dependencies must pause for coordinator, not edit T00 files silently.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Shared UI/styles/client API/pagination | NOT_STARTED | Not executed | None |
| Auth pages/layout/logout and boundaries | NOT_STARTED | Not executed | None |
| Auth browser and client helper tests | NOT_STARTED | Not executed | None |

## Validation

Acquire postgres-test and next-e2e leases for auth browser tests; run unit tests and available regressions/lint/typecheck/build. Record later protected-page checks explicitly deferred to T08/T09, not falsely green. Shared components cannot be changed by concurrent feature agents.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record client API/error props, shared component/pagination usage for T08/T09.
Blockers: T03 not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge T08 also needs T05; T09 also needs T07.
Coordinator acceptance / merge SHA: Pending.
