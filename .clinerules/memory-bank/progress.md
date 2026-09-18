# Progress

## Current acceptance — 2026-09-18 (T00, T01, T02)

T00 approved by user; task tip `7d880636bd1a045f3ff8eb4d01b893a8a91bb34c`, tested acceptance merge `997874c5325a53c26d68658ce1bfb3a1f466282e`. Coordinator frozen install / 22 unit tests / lint / typecheck / build all exit 0. No DB/browser rerun during acceptance; worker's real-PG parent/child reset smoke is recorded in its card. Integration/E2E remain deferred, not passed. Verify published merge ancestry before successors; retain branch unchanged.

T01 approved by user and merged by the coordinator: approved task tip `a19d7c8edbe260a7086e101bd34f06e6d2f9452c`, tested merge `b801d3ae93e7cbca1e4f659bd17e375609fcf7de` (base `237b01b`, `--no-ff`, no conflicts). Merged-revision verification: `pnpm test integration` 25/25 on real PostgreSQL (constraint/enum/integer boundaries, BetterAuth 1.7.5 schema parity, rollback and true serialization-conflict retry), `pnpm lint` 0, `pnpm build` 0, and `pnpm test unit` 28/28 with `pnpm typecheck` 0 after `pnpm db:generate`. **Accepted limitation (user decision, "accept as-is"):** `generated/prisma` is git-ignored and only the integration path runs `prisma generate`, so a clean checkout needs `pnpm db:generate` before `pnpm test unit`/`pnpm typecheck`; documented in `README.md` and techContext rather than fixed inside T01. T01's frozen branch stays unchanged at `a19d7c8`. T02 was subsequently integrated onto this main and accepted — see the T02 record below and in the graph.

T02 approved by user (after the coordinator walked through the implementation) and merged by the coordinator: approved task tip `fc14c2bb8f344bdcfd6ec0bf4f84f8860067ba41`, tested merge `3f6a1d136e4a79df5d5b3f0840ef06cbfba99261` (base `237b01b`, `--no-ff` over `ae1becc`, no conflicts). T02 delivers strict Zod 4 input schemas and public DTOs, exact integer-cent money with one half-up tax step, server-only env validation and the HTTP/error/origin/cookie helpers (structural `P2034 → 409` as the seam with T01's retry helper); 36 unit tests. Merged-revision verification: `pnpm install --frozen-lockfile` 0, `pnpm test unit` 67/67, `pnpm test integration` 25/25 on real PostgreSQL, `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, no manual `db:generate`. Its reviewed tip already contained the T01/harness integration (merge `636ef73`), so no rework branch was required; `task/T02-contracts` is frozen at `fc14c2b` and both task refs were re-verified after the merge. E2E remains deferred. T03 is dependency-eligible but not automatically dispatched.

**Post-acceptance fix:** branch `fix/harness-prisma-generate` (red `3745418`, impl `ae26c77`, user-approved, no separate reviewer, coordinator-authored on T00-owned paths) makes `pnpm test unit`, `pnpm typecheck` and `pnpm build` generate the client themselves (harness `T00-H21..H23`; unit 28 → 31), verified by a clean-checkout simulation, a per-gate generate proof, `pnpm test integration` 25/25 and `pnpm lint` 0.

The dated planning-baseline statements below (no harness, Docker unavailable, all acceptance pending) are historical, superseded by this acceptance and graph record. Skill now specifies coordinator merge/push verification, frozen retained branches, numeric short-dispatch aliases and evidence-based dependency qualification without post-approval status commits.


## Completed
- Investigated template, requirements, existing planning draft and memory-bank rules.
- Confirmed BetterAuth + Prisma + bcryptjs choice.
- Expanded implementation specification with models, API/functions/files, dependencies, security/business decisions, TDD and all 36 requirement IDs.
- Initialized six project memory documents; application remains untouched.

## Verification baseline (2026-09-18)
- pnpm lint: passed.
- timeout-bound pnpm build: passed, exit code 0; log `/tmp/stockflow-build-check.log` (temporary environment artifact).
- No application tests exist to run; no DB migration/seed executed.
- Docker unavailable in this WSL distro; real PostgreSQL execution remains blocked until enabled.

## Execution dashboard

Dependency source: `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json`. Coordinator updates this dashboard only after reviewing task evidence. All owners unassigned; all acceptance/merge evidence pending.

| Task | Status | Depends on | Completed deliverables |
|---|---|---|---|
| T00 Toolchain | DONE | None | Pinned toolchain/Compose, guarded harness (22 tests), env inventory; merge 997874c verified |
| T01 Database | DONE | T00 | Prisma schema + initial migration with 11 CHECK constraints, lazy pg-adapter client, bounded serializable retry helper, 25 real-PG + 6 unit tests; merge b801d3a verified; post-acceptance harness fix `fix/harness-prisma-generate` removes the manual `pnpm db:generate` prerequisite (unit 31) |
| T02 Contracts | DONE | T00 | Strict Zod contracts + DTOs, exact integer-cent money with half-up tax, server-only env validation, HTTP/error/origin/cookie helpers with structural P2034→409, 36 unit tests; merge 3f6a1d1 verified (unit 67/67, integration 25/25, lint/typecheck/build 0) |
| T03 Auth/seed | TODO | T01,T02 | None |
| T04 UI/auth | TODO | T03 | None |
| T05 Products API | TODO | T03 | None |
| T06 Draft invoices | TODO | T05 | None |
| T07 Lifecycle | TODO | T06 | None |
| T08 Products UI | TODO | T04,T05 | None |
| T09 Invoices UI | TODO | T04,T07 | None |
| T10 Release | TODO | T08,T09 | None |

Planning resources completed: JSON DAG, readable dependency guide, 11 deliverable/evidence cards, portable Cline skill, AGENTS startup protocol and plan test-ownership amendment. No feature code implemented. Graph check confirmed acyclicity, all 36 requirement mappings and no unordered source ownership overlap. Skill is instructions, not an executable test harness. Final package validation checked all 11 cards against graph dependencies/IDs, all 36 requirements, Mermaid edges, file ownership and deliverable/handoff fields. Fresh lint/build checks exited 0; no project test script exists. Captured report: `/tmp/stockflow-execution-validation.txt` (temporary, not durable release evidence). One AGENTS trailing blank-line warning was corrected before final diff check.

## Worktree lifecycle revision

Skill/graph/guide/AGENTS/plan/T00 now specify agent-owned `.worktrees` creation, explicit feature cwd, safe resumption and non-forced post-push cleanup. Coordinator bootstrapped `/.worktrees/` ignore before T00. Scratch-repository smoke test passed with two independent worktrees, worktree-local tests, commit/main integration/local bare-remote push, SHA verification, safe removal/branch retention/recreation, primary unchanged, and dirty sibling removal refused. Ignored artifacts can be deleted by Git removal, so manual classification/durable evidence is mandatory. Temporary report: `/tmp/stockflow-worktree-validation.txt`. No StockFlow branch/commit/push/worktree created; no application test claims.

## Pending
Separate application coding approval, dependency setup, PostgreSQL migrations/seed, auth, products, invoices, UI, Swagger, all tests and README release workflow. No claim that planning equals completed functionality. Initial Git history has one Initialize Repo commit; no new commits made in documentation-only task. Document/check incremental feature commits during implementation.
