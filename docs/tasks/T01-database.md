# T01 — PostgreSQL schema and persistence

Status: REVIEW
Owner: T01 worker (dispatch "T001" → T01, implementation + task-branch push authorized)
Depends on: T00
Requirement IDs: A1, I3, I4, V6, N1
Branch / worktree / base SHA: `task/T01-database` / `/home/areion/projects/eterna-take-home/.worktrees/T01-database` / `237b01b74e0c2bda135d84850c7a4ffc87799068` (origin/main at creation)
Accepted dependency revisions: T00 approved task tip `7d880636bd1a045f3ff8eb4d01b893a8a91bb34c` and tested merge `997874c5325a53c26d68658ce1bfb3a1f466282e`, both verified ancestors of fetched origin/main `237b01b74e0c2bda135d84850c7a4ffc87799068` before branch creation (`git merge-base --is-ancestor` exit 0). postgres-test lease granted by coordinator for this task; released after final runs.

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
| Schema and PostgreSQL migration/constraints | VERIFIED | `prisma/schema.prisma` (7 models + InvoiceStatus enum, prisma-client generator → `/generated/prisma`), `prisma/migrations/20260918000100_init/migration.sql` (generated DDL + scalar CHECK constraints: product price/stock/version, invoice totals/tax-bps/dates/version, item price/qty/lineTotal bigint-cast/position), `migration_lock.toml` postgresql; `prisma format`/`db:generate`/`migrate diff` generated cleanly; 21 constraint/enum/integer/FK/unique red→green cases | eafc78c tests; schema 46f9d1b |
| Lazy client and bounded transaction helper | VERIFIED | `lib/prisma.ts` lazy singleton (pg adapter, no import-time env/connection, globalThis caching in non-production) + `lib/services/transaction.ts` Serializable `$transaction`, retrying only recognized `P2034`, 3 total attempts, rethrowing the final error (incl. exhaustion) unchanged for T02 409 mapping | eafc78c |
| Real migration/constraint/rollback tests | VERIFIED | `tests/integration/database.test.ts` 25 tests: deployed-tables, 20 invariant cases (incl. 22P02/22003 integer bounds, bigint-overflow, reversed dates, SKU uniqueness after soft-delete/cross-owner, RESTRICT/CASCADE), BetterAuth 1.7.5 `getAuthTables` field/type/nullability parity from `@better-auth/core/db`, real-PG rollback and true serialization-conflict retry; `tests/unit/transaction.test.ts` 6 tests (isolation argument, retry-then-succeed, exhaustion rethrow, 3 nonretryable cases) | eafc78c |

## Validation

Under the granted postgres-test lease (localhost:5433/stockflow_test tmpfs):

- Red evidence: minimal deployed-tables test failed before any T01 file existed; 17/21 constraint cases red before CHECK constraints existed; retry unit tests 2/6 red (single attempt, no `P2034` retry) before the loop was implemented; import/config failures never counted as red.
- `PRISMA_USER_CONSENT…=… pnpm exec prisma migrate reset --force` (user consented in chat to resetting localhost:5433/stockflow_test) → 0; schema deployed to an empty database via committed migration history, never `db push` or post-hoc DDL. The two empty, documented T00 smoke tables (`reset_check_parent/child`) were dropped first inside a transaction after row-count/identity checks.
- `pnpm test unit` → 0 (28 tests, 3 files: 20 harness + 2 env + 6 transaction).
- `sg docker -c 'pnpm test integration'` → 0 (25 tests: harness preflight, client generation, migrate deploy, FK-order reset between files, real-PG assertions).
- `pnpm lint` → 0; `pnpm typecheck` → 0; `pnpm build` → 0 (log artifacts in /tmp are disposable; commands/results recorded here).
- Interim failures were honestly recorded: 17-fail red baseline, mock-queue contamination (`clearAllMocks` vs `mockReset`) corrected, `Prisma.dmmf` absent from generated prisma-client output (replaced with information_schema comparisons), `next typegen` typecheck fixed, typecheck/lint/build all rerun after final edits. Committed in two reviewed commits (`46f9d1b`, `eafc78c`); no T02/shared files touched.
- Limitations: seed intentionally deferred to T03; no auth/server.ts, seed, or HTTP code written; no shared config/manifest edits; `migrate reset` consented for test DB only.

## Validation commands

Under postgres-test lease: client generation, schema validation, empty DB migrate deploy, targeted database integration and retry unit tests; existing tests/lint/typecheck/build as available. Seed intentionally awaits T03. Never modify already-merged migration history to repair later task assumptions without coordination.

## Handoff

Completed: All three deliverables (see table). Remaining: none for T01; seed and auth await T03; contract mapper awaits T02.
Red/green commands/results: see Validation; every implemented behavior was first observed as a meaningful behavioral red (17 constraint failures, 2 retry failures, missing-tables failure), then green on the same commands; full unit/integration/lint/typecheck/build suites exit 0 at `eafc78c`.
Implementation/tested SHA: `eafc78c` (schema commit `46f9d1b`, both on `task/T01-database`). Integrated main SHA: recorded after pre-push origin/main integration below.
Uncommitted work: none at handoff; card evidence committed before push.
Contract notes: T01 exposes `withSerializableRetry<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>` — runs the callback in a Serializable `$transaction`, retries at most 3 total attempts, retries **only** `PrismaClientKnownRequestError` code `P2034`, and rethrows the final error unchanged on exhaustion; T02 can map that error to 409 without importing T01 internals. Prisma client is `getPrisma()` lazy singleton over `PrismaPg`; env is read only inside the function (no import-time env/DB access), so imports never query the DB and the generated client lives in `/generated/prisma` (gitignored). `prisma.config.ts` loads dotenv, schema path, migrations path, and the explicit seed command (`tsx prisma/seed.ts`, owned by T03). Migration `20260918000100_init` is frozen history: services validate cross-row totals/ownership in transactions; migration enforces scalar invariants and the lineTotal bigint-cast product, integer-column bounds (22P02/22003), bounded tax bps, dueDate ≥ issueDate, `(userId, sku)` unique incl. soft-deleted rows, RESTRICT on product/user deletes, CASCADE only invoice→items.
Blockers: none.
Push/PR status: task branch pushed after main integration (see chat for pushed SHA); main untouched.
Next action: Coordinator review/acceptance/merge; after DONE, T03 becomes eligible only when T02 is also accepted.
Coordinator acceptance / merge SHA: Pending.
