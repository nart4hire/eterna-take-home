# T00 — Toolchain and test infrastructure

Status: TODO
Owner: Unassigned
Depends on: none
Requirement IDs: A8, N1, N2, N4
Branch / worktree / base SHA: Not created
Accepted dependency revisions: None

## Scope and ownership

Own only T00 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan headings: Dependencies; Testing; Files infrastructure. No schema, auth, business services or feature UI. Freeze approved package versions and selected shadcn dependencies for successors; no later worker may silently change lockfile.

## Acceptance and test design

- Docker dev/test services isolated on 5432/5433; test reset refuses dev/remote/wrong DB/port before any mutation.
- Write failing runner target-safety/env-example tests first. Unit suite needs no Docker; child failures propagate nonzero; processes cleaned up without touching others.
- Configure strict test selection: existing suites only, no passWithNoTests used to claim coverage. Scripts for later Prisma/seed phases can exist, but unavailable phases must be explicitly documented, not faked.
- Harness/reset uses schema-independent pg operations; tests/support holds pure requests/server-only shim. Auth-backed fixtures belong to T03.
- Install and pin approved dependencies, ignore secrets but allow example, add explicit commands and safe environment inventory. Preserve existing Next versions and alias.
- Coordinator publishes `/.worktrees/` ignore rule before dispatch; verify it before creating your own feature worktree. Preserve that rule when editing your worktree's .gitignore. Run installs/tests only in your feature worktree; audit file discovery so harness/lint cannot traverse sibling worktrees. Follow skill cleanup gates after verified push; retain on blockers.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Dependencies/scripts/Compose | NOT_STARTED | Not executed | None |
| Safe isolated test harness and tests | NOT_STARTED | Not executed | None |
| Environment example and secret exclusions | NOT_STARTED | Not executed | None |

## Validation

Record actual commands/exit codes for harness unit tests, Compose health, lint and starter build/typecheck. Full migration/seed/business/E2E checks deferred to T01/T03/features; do not report them passed. Docker unavailable in original WSL environment: pause until enabled. Acquire postgres-test/next-e2e leases as applicable.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands and results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record installed versions and exact subset runner commands for successors.
Blockers: Coding authorization, published planning baseline, Docker prerequisite.
Push/PR status: Not pushed.
Next action: Coordinator qualifies/assigns task; after acceptance/merge dispatch T01 and T02.
Coordinator acceptance / merge SHA: Pending.
