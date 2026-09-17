# T00 — Toolchain and test infrastructure

Status: REVIEW
Owner: Cline agent (Union Alpha); exclusive assignment + task-branch push authorization confirmed by user in chat 2026-09-18

Resumption note (2026-09-18): Branch/worktree was initially created before explicit READY confirmation; worker self-blocked, preserved state, and obtained coordinator/user confirmation before resuming. Assignment, task-branch commit/push authorization (no main merge), and the postgres-test lease (localhost:5433/stockflow_test) were then confirmed. The pre-confirmation note is retained for audit; earlier chat self-declaration of the lease was withdrawn and re-granted by the user. Primary project files remain unchanged throughout.
Depends on: none
Requirement IDs: A8, N1, N2, N4
Branch / worktree / base SHA: task/T00-toolchain / /home/areion/projects/eterna-take-home/.worktrees/T00-toolchain / bacb863 (origin/main, verified 2026-09-18)
Accepted dependency revisions: none required (no depends_on)

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
| Dependencies/scripts/Compose | VERIFIED | `pnpm add -E`/`-DE` pinned installs exit 0 (`/tmp/t00-install.log`, `/tmp/t00-dev-install.log`); compose `--profile test up -d --wait postgres-test` reports Healthy on 127.0.0.1:5433 (`/tmp/t00-postgres.log`); starter `pnpm build` exit 0 (`/tmp/t00-build.log`) | This branch @ commit below |
| Safe isolated test harness and tests | VERIFIED | TDD: 4 meaningful red failures (missing scripts/config/impl) then 22/22 green (`/tmp/t00-current-tests.log`, `/tmp/t00-full-vitest.log`); `pnpm test unit` exit 0 (`/tmp/t00-runner-unit.log`); real-PostgreSQL reset check SEEDED 2/3 → AFTER_RESET 0/0 TABLES_KEPT 2, RESET_CHECK PASS exit 0 (`/tmp/t00-reset-check.log`); guard `pnpm test integration` refuses with "Unavailable integration suite" exit 1 (`/tmp/t00-runner-guard.log`) | This branch @ commit below |
| Environment example and secret exclusions | VERIFIED | `tests/unit/environment-example.test.ts` 2/2 green: full 10-var inventory, placeholder auth secret, no NEXT_PUBLIC, `.env`/`.env.local` ignored while `.env.example` trackable and `/.worktrees/` rule preserved | This branch @ commit below |

## Validation

Commands and exit codes (all in worktree `/home/areion/projects/eterna-take-home/.worktrees/T00-toolchain`, base/integrated main `bacb863`):

- `pnpm install --frozen-lockfile` (template baseline) → 0
- `pnpm add -E <12 runtime pkgs>` / `pnpm add -DE <10 dev pkgs>` → 0 after approving `@prisma/engines`/`esbuild`/`prisma` builds in `pnpm-workspace.yaml` (`@scarf/scarf` disabled)
- `pnpm exec vitest run tests/unit` → 0 (22 tests, 2 files)
- `pnpm test unit` (real runner path) → 0; `pnpm test integration` → 1 (documented refusal: T01 phase not implemented; nothing faked)
- `pnpm lint` → 0; `pnpm typecheck` (next typegen + tsc --noEmit) → 0; `pnpm build` → 0
- `sg docker -c "docker compose --profile test up -d --wait postgres-test"` → Container stockflow-postgres-test-1 Healthy (pg_isready); listening 127.0.0.1:5433 only
- Real-PostgreSQL reset verification (parent/child FK tables seeded, `resetTestDatabase()` run): SEEDED {p:2,ch:3} → AFTER_RESET {p:0,ch:0}, TABLES_KEPT 2 → RESET_CHECK PASS (exit 0)
- Process hygiene: no orphaned tsx/vitest/next/playwright processes after runs

Deferred (not claimed): Prisma migration/generate against live DB, seed, auth/integration suites, E2E, Swagger — T01/T03+/T10 scope. Dev-DB (5432) service not started; dev-DB refusal verified by unit tests T00-H4/T00-H17.

## Handoff

Completed: All three deliverables (see table). Remaining: none for T00; successor phases as listed above.
Red/green commands and results: red = 4 failures (missing test script, missing playwright.config.ts, stale FK_DELETE_ORDER import, subset `undefined` behavior) → green = 22/22 + runner/lint/typecheck/build/reset checks above.
Implementation/tested SHA: recorded at push time in chat handoff. Integrated main SHA: `bacb863` (origin/main unchanged during task; re-verified before push).
Uncommitted work: none at handoff; all evidence committed with card.
Contract notes for successors: installed/pinned versions — next 16.3.5 (unchanged), react 19.2.8 (unchanged), @/* alias unchanged; better-auth 1.7.5, prisma + @prisma/client + @prisma/adapter-pg 7.9.1, pg 8.23.0, bcryptjs 3.0.3, zod 4.6.5, vitest + @vitest/coverage-v8 5.0.1, tsx 4.23.13, dotenv 17.4.2, @playwright/test 1.63.0, swagger-ui-dist 5.33.0, server-only 0.0.1, openapi-types 12.1.3, @apidevtools/swagger-parser 13.0.0, @types/pg 8.23.1, @types/swagger-ui-dist 3.30.6. Runner: `pnpm test [unit|integration|e2e]` — no arg = full suite; unit runs without Docker; integration/e2e require prisma schema+migrations, the postgres-test lease, and validate TEST_DATABASE_URL (localhost:5433/stockflow_test, no query params) before any mutation; children get test-only BETTER_AUTH_SECRET + BETTER_AUTH_URL=http://localhost:3100 + NODE_ENV=test + STOCKFLOW_TEST_DATABASE_READY=1; DB URLs forced onto validated test target. Shared primitives: `tests/support/database-target.ts` (assertSafeTestDatabase/safeConnectionOptions), `tests/support/reset.ts` (resetTestDatabase — FK-discovered, transactional), `tests/support/request.ts` (makeRequest with origin header), `tests/support/server-only.ts` (vitest alias target), `tests/setup.ts` (integration-only guarded beforeEach reset; direct `vitest tests/integration` runs fail closed). Compose: dev postgres profile-default on 127.0.0.1:5432 (named volume), postgres-test profile [test] on 127.0.0.1:5433 (tmpfs). Vitest: passWithNoTests=false, fileParallelism=false, server-only aliased (never disabling real auth). Playwright: workers=1, chromium, port 3100, reuseExistingServer=false; browser install (`pnpm exec playwright install --with-deps chromium`) still required before first E2E run. pnpm-workspace allowBuilds: prisma/@prisma/engines/esbuild true, @scarf/scarf false, sharp/unrs-resolver false. `minimumReleaseAgeExclude: lucide-react@1.47.0` retained from template tooling. T02 joins at `lib/env.ts` (readEnv) / `lib/http.ts`; T01 owns `prisma/*` + `lib/services/transaction.ts`; the runner auto-detects both phases.
Blockers: none. Note: Docker daemon access required `sg docker -c` (user not in active supplementary group this session); compose pulled postgres:17 successfully under that wrapper.
Push/PR status: task/T00-toolchain pushed (see chat for pushed SHA); main not touched.
Next action: Coordinator review/acceptance/merge; only after DONE dispatch T01 and T02.
Coordinator acceptance / merge SHA: Pending.

