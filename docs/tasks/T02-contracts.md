# T02 — Shared contracts and pure helpers

Status: IN_PROGRESS
Owner: Cline; exclusive T002 -> T02 user dispatch (implementation, commits and task-branch push authorized; no main merge). No DB/port leases needed.
Depends on: T00
Requirement IDs: A8, I3, V2, V3, N6
Branch / worktree / base SHA: task/T02-contracts / /home/areion/projects/eterna-take-home/.worktrees/T02-contracts / 237b01b74e0c2bda135d84850c7a4ffc87799068
Accepted dependency revisions: T00 approved tip 7d880636bd1a045f3ff8eb4d01b893a8a91bb34c; coordinator-tested merge 997874c5325a53c26d68658ce1bfb3a1f466282e. Both verified ancestors of fetched origin/main; retained branch tip matches approval. Acceptance graph record supersedes historical Pending card.

## Scope and ownership

Own T02 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan: Types, Functions, security/money decisions. No generated Prisma imports, auth implementation or database helper; runs alongside T01.

## Acceptance and test design

- Define strict complete input schemas and public DTOs, including versions, status union, pagination, dates and field paths. Reject extra ownership/prices/totals fields and duplicate lines.
- Write unit tests before exact decimal-string-to-cents parsing, half-up basis-point tax and bounds; exercise multibyte passwords/date validity/unsafe pagination.
- Server env validates required secrets/URLs/tax, rejects placeholders; omission tax = 1100. No public secret exports.
- Consistent AppError/JSON/origin mapping; all Set-Cookie headers preserved individually by response forwarding. Test sanitized 500 and recognized transaction-exhaustion error -> 409 without importing T01 modules.
- Pure helpers import independently of DB/server environment. Stable contracts must support all planned routes; unresolved schema/API ambiguity blocks T03 join.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Complete schemas and DTO contracts | NOT_STARTED | Not executed | None |
| Exact money and validated server env | NOT_STARTED | Not executed | None |
| HTTP/error/origin/cookie helpers and tests | NOT_STARTED | Not executed | None |

## Validation

Run owned unit tests without Docker, then existing unit regressions/lint/typecheck/build as available. Record any DB-dependent deferred checks, not mock claims of integration correctness. T03 verifies actual BetterAuth forwarding and schema compatibility.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record exact DTO/helper exports and error statuses for all successors.
Blockers: T00 not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge, T03 requires T01 also accepted.
Coordinator acceptance / merge SHA: Pending.
