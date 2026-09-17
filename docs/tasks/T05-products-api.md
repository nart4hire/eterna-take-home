# T05 — Products API

Status: TODO
Owner: Unassigned
Depends on: T03
Requirement IDs: I1, I2, I3, I4, A6, A7, N6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

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
| Product service/routes and CRUD/search/pagination | NOT_STARTED | Not executed | None |
| Validation/version/soft-delete handling | NOT_STARTED | Not executed | None |
| Real endpoint authentication/ownership/regression tests | NOT_STARTED | Not executed | None |

## Validation

Under postgres-test lease run product tests and auth/DB regressions, then lint/typecheck/build. Manual version stale-write test and DB reference retention included. Shared fixtures are read-only; domain-specific local test helpers may live in owned test file.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record query parameters, delete version JSON, response/errors and service exports.
Blockers: T03 not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge T06 eligible; T08 also requires T04.
Coordinator acceptance / merge SHA: Pending.
