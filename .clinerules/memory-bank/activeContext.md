# Active Context

## Current update — T01 accepted (supersedes historical planning notes below)

T00 accepted: task tip `7d880636bd1a045f3ff8eb4d01b893a8a91bb34c`, merge `997874c5325a53c26d68658ce1bfb3a1f466282e`. T01 accepted and merged: task tip `a19d7c8edbe260a7086e101bd34f06e6d2f9452c`, tested merge `b801d3ae93e7cbca1e4f659bd17e375609fcf7de` (base `237b01b`). Both branches retained unchanged; historical REVIEW/Pending card text does not block accepted dependencies. Graph acceptance records and skill sections 1/7 govern evidence and coordinator merges; no post-approval task-branch bookkeeping commits.

T01 delivers the PostgreSQL contract: `prisma/schema.prisma` (7 models + `InvoiceStatus`), the frozen initial migration `20260918000100_init` with 11 scalar CHECK constraints and RESTRICT/CASCADE rules, `lib/prisma.ts` lazy `getPrisma()`, and `lib/services/transaction.ts` `withSerializableRetry` (Serializable, retries only `P2034`, 3 total attempts, rethrows for T02's 409 mapping). Verified on the merge: integration 25/25 real-PG, lint 0, build 0, unit 28/28 and typecheck 0 after `pnpm db:generate`.

**Prerequisite for every successor:** `generated/prisma` is git-ignored and only the integration path runs `prisma generate`, so run `pnpm db:generate` before `pnpm typecheck` or `pnpm test unit` on a clean checkout/worktree. This is a user-accepted limitation of the T01 merge, documented in `README.md`, not a fix inside T01. T02 (REVIEW, tip `026abf1`) must run it when revalidating after integrating this merge.

Next: T02 remains unaccepted and is not automatically dispatched; T03 stays blocked until both T01 and T02 are accepted and published. Ownership conflicts and DB/port leases still block. Docker works via `sg docker -c`; the shared test service was left running and leases are released. Bare `pnpm test` still preflights missing suites (integration now exists, E2E does not).

## Historical planning context


As of 2026-09-18, documentation-only planning is underway/completing. User approved Act mode specifically to revise the plan and initialize memory bank, with application coding awaiting separate confirmation.

Specification: `/home/areion/projects/eterna-take-home/implementation_plan.md`. BetterAuth + Prisma + bcryptjs explicitly selected. Corrected draft gaps: actual auth schema, bcrypt instead of default scrypt, immediate revocation, optional-not-required proxy, exact money rounding, ownership, snapshots, concurrency/version checks, complete requirement/test matrix, PostgreSQL test isolation and local Swagger assets.

Execution resources now created: canonical DAG at `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json`, guide at `/home/areion/projects/eterna-take-home/docs/execution/dependency-tree.md`, T00–T10 cards under `/home/areion/projects/eterna-take-home/docs/tasks/`, and skill at `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. All task deliverables are NOT_STARTED; none assigned or accepted. Worktree revision: each worker creates `<PRIMARY>/.worktrees/<task-id>-<slug>` on `task/<task-id>-<slug>`, never edits/tests in primary, and removes only its own clean worktree after verified push and durable REVIEW handoff. Blocked/dirty/conflicted worktrees are preserved. Coordinator added `/.worktrees/` ignore bootstrap; publish it before dispatch. Skill retains all ownership, TDD, main-integration, conflict-stop and shared-resource gates.

Next: coordinator reviews/commits/publishes planning baseline, obtains task coding/push approval, enables Docker and assigns T00. Workers use isolated branches/worktrees, test-first, pull origin/main/revalidate before branch push, pause on conflicts and hand off REVIEW. Central memory is coordinator-only; workers report proposed updates in cards. No application implementation, branch creation, commit or push performed in this documentation task.
