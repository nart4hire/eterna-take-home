# T01 — PostgreSQL schema and persistence

Status: TODO
Owner: Unassigned
Depends on: T00
Requirement IDs: A1, I3, I4, V6, N1
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

## Scope and ownership

Own T01 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read Types/Functions/Dependencies in plan. No seed/auth server or shared HTTP/type files. May run concurrently with T02; avoid importing its unmerged code.

## Acceptance and test design

- Auth schema matches pinned BetterAuth adapter; domain models, version fields, FK restrictions, SKU uniqueness, integer/date CHECK constraints match specification.
- Write failing migration/constraint integration tests; deploy actual migration history to empty PostgreSQL, test invalid data rejection and persistence.
- Prisma client lazy singleton with pg adapter, explicit generated output, no eager build-time DB query.
- Serializable helper retries recognized conflicts only, at most three attempts. Unit tests cover nonretryable failure and exhaustion; integration proves rollback. Rethrow recognized Prisma error on exhaustion; T02 maps it to 409, so no T02 dependency.
- Schema generation may use temporary local configuration but do not commit fake auth exports or change another owner's files.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Schema and PostgreSQL migration/constraints | NOT_STARTED | Not executed | None |
| Lazy client and bounded transaction helper | NOT_STARTED | Not executed | None |
| Real migration/constraint/rollback tests | NOT_STARTED | Not executed | None |

## Validation

Under postgres-test lease: client generation, schema validation, empty DB migrate deploy, targeted database integration and retry unit tests; existing tests/lint/typecheck/build as available. Seed intentionally awaits T03. Never modify already-merged migration history to repair later task assumptions without coordination.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record generated model compatibility, migration commands, retry error contract.
Blockers: T00 not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge, T03 becomes eligible only when T02 also accepted.
Coordinator acceptance / merge SHA: Pending.
