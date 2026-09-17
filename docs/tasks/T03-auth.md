# T03 — Authentication API and seed

Status: TODO
Owner: Unassigned
Depends on: T01, T02
Requirement IDs: A1, A2, A3, A4, A5, A6, A7, A9, N3, N6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

## Scope and ownership

Own T03 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read auth/security, Types, Functions and route contracts in plan. No schema/HTTP contract changes without coordinator; reconcile T01/T02 at this join first.

## Acceptance and test design

- Test registration normalization/uniqueness/policy, real bcrypt cost/salts, identical unknown-user/wrong-password errors, successful cookie login, logout revocation including copied cookie, expiry and cookie attributes.
- Implement explicit auth routes and page/API session helpers. Fixed expiry, no cookie cache, safe public DTOs, individually forwarded Set-Cookie, same-origin mutations. No public auth catch-all/unrequested features.
- Write seed-twice test then seed via configured auth hashing: one demo/five products, README-specified credentials work, no stock/password reset on rerun, refuse production seed.
- Own tests/helpers.ts with real registerAndLogin and product DB fixture helper; don't depend on not-yet-existing product endpoints. A6/A7 guard contribution here does not replace endpoint-specific tests in T05–T07.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Auth configuration/wrappers/session guards | NOT_STARTED | Not executed | None |
| Bcrypt/session/origin integration tests | NOT_STARTED | Not executed | None |
| Idempotent PostgreSQL seed and fixtures | NOT_STARTED | Not executed | None |

## Validation

Acquire postgres-test lease; run auth/seed tests with real DB/auth, existing regressions, lint/typecheck/build. Verify response headers using actual Requests, not only mocked helpers. If adapter schema differs, pause; don't modify T01-owned migration independently.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record actual auth cookie names, wrapper status/body/Origin and fixture signatures.
Blockers: Dependencies not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After acceptance/merge T04 and T05 may edit concurrently, database tests serialized.
Coordinator acceptance / merge SHA: Pending.
