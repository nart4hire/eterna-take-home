# T00-toolchain.md

Here's the full walkthrough. First, the framing that makes everything else click:

## The big picture: these tests test the *test infrastructure*

Normally tests verify your app's features ("does the login button work?"). T00 is different — it's the task that *builds* the testing infrastructure itself. So the tests I wrote answer a different question: **"Can we trust the machinery we'll use to test everything else?"**

That might sound circular, but it's one of the most important kinds of tests in a real codebase. Why? Because a broken test suite is worse than no test suite. If the runner silently wipes the wrong database, or passes when it should fail, every future "✅ green" becomes meaningless. T00's tests are the safety inspection of the lab equipment, done before any experiments run.

Two design choices before the individual tests:

- **They're pure unit tests** — no Docker, no database, no network. That's why `pnpm test unit` runs in ~300ms and works even before any containers exist. Safety logic that you can verify cheaply gets run constantly.
- **They were written TDD-style** — I wrote the tests first, ran them, and watched 4 of them *fail* against the not-yet-written runner (red), then implemented `scripts/test.ts` etc. until they passed (green). That proves the tests actually test something — a test that has never seen a failure can't be trusted.

---

## File 1: `tests/unit/test-harness.test.ts` (20 tests)

### Group 1 — "The test database must be impossible to mistake for the real one"

This is the most safety-critical group. The runner's `assertSafeTestDatabase()` takes a database URL and refuses it unless it's *exactly* the agreed throwaway target: host `localhost`/`127.0.0.1`/`[::1]`, port **5433**, database name **`stockflow_test`**.

We test the refusals: a URL pointing at the **dev database (port 5432)** → rejected; a **remote host** like `prod.db.example.com` → rejected; a weird **scheme** like `mysql://` → rejected; a URL with **query params or a fragment** → rejected. Why that last one? Because in Postgres connection strings, things like `?sslmode=disable` or `?host=...` are *libpq overrides* — they can silently redirect the connection somewhere you didn't expect. A URL that "looks safe" but carries extra instructions is not safe, so we refuse it outright.

**The why, in plain terms:** the reset helper's whole job is `DELETE FROM every table`. If a typo or a leaked environment variable ever points that at your development data — or someday, production — you've destroyed real work with one bad run. This guard makes the destructive command *fail closed*: when in doubt, refuse to run. Every guard test exists because "it should be fine, I'll just be careful" is how databases get dropped. Also note the flip side: one test asserts the *legitimate* URL **is** accepted, so the guard is strict but not a wall that blocks all work.

### Group 2 — "The runner must take its argument seriously"

`parseRunnerSubset` accepts `unit`, `integration`, `e2e`, or nothing. The tests pin down each behavior:

- **No argument → the full suite.** This was actually a bug I caught with my own tests: my first draft threw an error on `undefined`, but the documented contract says bare `pnpm test` means "run everything." The red phase caught it before commit.
- **Garbage input → throw.** If someone types `pnpm test intregration` (typo), the runner must not guess, silently run zero tests, or default to "unit" — it must fail loudly. A typo'd command that quietly succeeds is a trap: you *think* you tested something and you didn't.

### Group 2.5 — "A missing suite directory is a failure, not an empty pass"

Related and important enough to spell out: if you run `pnpm test integration` and the `tests/integration/` folder doesn't exist yet, the runner errors with *"Unavailable integration suite: implement its task before claiming coverage"*. The test proves the check exists for all three suites.

**The why:** this is the "no false coverage" rule. Vitest has a `passWithNoTests` option that treats "found no tests" as success. That's convenient… and dangerous. A task card could claim "tests pass!" when in reality zero tests ran. Our config sets `passWithNoTests: false` *and* the runner refuses missing suites, so an empty folder can never masquerade as a passing phase. (You saw this live: `pnpm test integration` exited 1 with exactly that message — correct behavior, since T01 hasn't built the schema yet.)

### Group 3 — "Failures must actually fail"

The runner shells out to child processes (vitest, docker compose, prisma). `runCommand` wraps `spawnSync`, and the tests prove two things: **output is streamed through** (so you can see what the child is doing) and **a nonzero exit code from the child becomes an exception** — which becomes a nonzero exit for the runner itself.

**The why:** a naive `spawn` call "runs" the command and returns `undefined` regardless of outcome. If vitest crashed and our runner reported exit 0, CI would show green over a broken build. The whole value of test infrastructure is *exit codes you can believe*. This group is what guarantees `pnpm test` returning 0 means something.

### Group 4 — "Reset must be smart enough to survive foreign keys"

`resetTestDatabase()` clears the test database between tests. The subtle part: Postgres enforces **foreign keys** — a "child" row that references a "parent" row can't be deleted while the parent link exists. If you delete in the wrong order (parents first), you get constraint violations and the reset dies halfway.

The naive fix is a hardcoded list: "delete `transactions` before `accounts` before `user`." But T01 doesn't exist yet — there's no schema! Any hardcoded order would be a lie that breaks the moment T01 adds a table.

So instead I built `deletionOrder(tables, foreignKeys)` — a small **topological sort**: "give me the tables and their references, and I'll order them children-first." The tests throw tricky graphs at it (chains, a self-referencing table, diamond shapes) and assert the ordering is always valid. This is a *discovery-style API*: the real reset asks the database's own catalog (via `pg_catalog`) what exists, then uses this function to compute the order at runtime.

**The why:** schema-independent reset means T01 can add tables all day and T00's reset keeps working, untouched. The `user` table ends up last because everything references it — delete dependents before dependents-on-them, always.

### Group 5 — "Config files are code too, so they get tests"

These tests read `package.json`, `vitest.config.ts`, `playwright.config.ts`, and `docker-compose.yml` as text and assert their invariants:

- **`package.json`**: the `test`, `test:unit`, `db:migrate`… scripts exist and call the runner.
- **vitest**: `passWithNoTests: false` and `fileParallelism: false` (integration tests share one database — parallel files would race and corrupt each other's data; serialized is slower but *deterministic*), and 15s test timeouts.
- **Playwright (E2E)**: `workers: 1` (one browser session = no flaky login races), port **3100**, chromium, and `reuseExistingServer: false` — meaning E2E always boots a *fresh* server rather than accidentally testing whatever dev server you left running. Tests against a stale server lie to you.
- **Compose**: test service binds `127.0.0.1:5433` only (never exposed to your network), uses **tmpfs** (RAM-backed disk — the database evaporates on `docker compose down`, nothing persists), and is under the `test` **profile** so `docker compose up` alone never starts it.

**The why:** configs have no function signatures to unit-test, so they usually go untested — and drift silently. Pinning them as tests means any change that breaks a safety property *shows up as a red test naming the exact invariant*, instead of as a mystery at 2am. This is "executable documentation": the comment "test DB must never be reachable from the network" is nice; a test enforcing it is better.

---

## File 2: `tests/unit/environment-example.test.ts` (2 tests)

**Test 1 — the complete inventory.** `.env.example` must exist and contain every variable the app needs: `DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_USER/PASSWORD/DB`, `TEST_POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TAX_RATE_BPS`, `NODE_ENV` — each with a non-empty value. The auth secret must be a *placeholder* (never a real credential — this file is committed to git). This pins the contract T02 (env loading) and every later task builds against: when the list evolves, this test forces `.env.example` to evolve with it, so no teammate ever hits a "mystery missing variable."

**Test 2 — no secrets leak.** Three assertions:
1. `.env.example` contains **no `NEXT_PUBLIC_*` variables** — anything Next.js exposes to the browser is public; we keep every var server-only by construction.
2. `.gitignore` **ignores `.env` and `.env.local`** — real secrets never enter git history (removing a secret from git later is painful; prevention is cheap).
3. **`!.env.example` is present** — the exception that lets the template itself be tracked, and the `/.worktrees/` ignore rule survives so our workflow's own plumbing stays intact.

**The why:** "we keep secrets in `.env`" is only as strong as the one `git add .` where someone's tired fingers skip the check. This test makes that mistake impossible to merge.

---

## What I deliberately did *not* test here

No integration tests, no E2E, no live migration runs — those need the Prisma schema and migrations, which belong to T01 and T03. The runner's job regarding them is just to *refuse honestly* until they exist (and that refusal is itself tested, as you saw with the exit-1 smoke check). One exception proves the rule: I did verify the reset helper against **real** PostgreSQL once, manually — because a pure unit test can't prove a SQL transaction actually commits — but that was a one-off evidence run recorded in the task card, not part of the unit suite.

---

## The transferable lessons

1. **Test the edges where your system touches dangerous things.** Money, deletion, external systems. The DB-guard tests are the densest group for exactly that reason.
2. **Fail closed.** Every ambiguous input (typo'd subset, suspicious URL, unknown env var downstream) should produce a loud refusal, never a silent guess.
3. **An empty pass is not a pass.** `passWithNoTests: false` + suite-existence checks = "green" always means "things ran."
4. **Exit codes are your contract with CI.** Test that failures propagate.
5. **Config is code.** Anything that changes behavior and isn't obvious from reading code deserves an assertion.
6. **Prefer deriving from reality over hardcoding.** Topological FK ordering instead of a static table list means the helper survives schema changes it's never seen.
7. **Tests written after the code can't be trusted until they've failed at least once** — hence the deliberate red phase.

# T01-database.md

Here's the full walkthrough. First, the framing that makes everything else click:

## The big picture: this task builds the *contract*, not a feature

T00 built the **test infrastructure** — the runner, the safety guards, the reset helper that clears the database between tests. T01 builds the **database contract** itself. So this isn't "does a product get created?" — that's a later task. T01 answers: **"Can we rely on the database to actually enforce the rules we're going to hang on it?"**

That matters because money and inventory bugs start here. If your `quantityOnHand` column allows negative values, every "don't oversell" check lives in application code that can be bypassed by a stray UPDATE, a future bug, or a direct database edit. If your migration history isn't committed and deployable, then "the schema on my machine" and "the schema in CI" quietly drift — one of the oldest and most destructive sources of "works on my machine" bugs. T01 makes those guarantees *executable*: the schema, the constraints, and the transaction safety primitive are all pinned by tests that run against real PostgreSQL.

Two design choices before the individual tests:

- **Most tests are real-PG integration tests** — they spin up the leased `stockflow_test` database (localhost:5433, tmpfs, per T00's harness), deploy the committed migration, then assert against PostgreSQL's actual catalog and error behavior. This is the honest choice: if you want to verify that a `CHECK` constraint rejects `-1`, or that `quantityOnHand * unitPrice` doesn't silently overflow 32-bit, you have to run it against the real database. You cannot fake that with mocks and still claim atomicity. (The retry helper, however, is unit-tested with mocks — see File 2.)
- **TDD, with a twist.** The tests were written first and observed red against a schema that lacked constraints (17 of 21 SQL-invariant cases failed initially, because PostgreSQL happily stored `-1` for quantity and overflowed `lineTotal`). Then the CHECK constraints were added to the migration and the same tests went green. The red phase here proves the tests actually catch what they claim — a constraint test that passes against an unconstrained schema is worse than useless.

---

## File 1: `tests/integration/database.test.ts` (25 tests, real PostgreSQL)

### Group 1 — "The deployment actually exists" (1 test)

`N1 A1: deployed persistence schema` asks PostgreSQL's `pg_tables` for the catalog and asserts all seven expected tables are present: the four BetterAuth tables (`User`, `Account`, `Session`, `Verification`) plus `Product`, `Invoice`, `InvoiceItem`.

- **The why, in plain terms:** before you can test constraints, you have to confirm the database *has* the tables you think it does. This is the "is the engine in the car?" check — cheap, and catches the whole class of "I created a migration locally but never committed it" or "the CI database is running a stale schema" bugs. It's the integration analog of T00's "is the runner configured?" assertions.

### Group 2 — "Every dangerous value is a rejected value" (20 tests)

`I3 I4 V6: SQL invariants` is the densest and most safety-critical group. It's parametrized over a table of bad values and asserts each one is rejected by PostgreSQL with the correct error class:

- **Negative money, bad stock, bad version (23514):** `Product.unitPrice = -1`, `Invoice.total = -1`, `Invoice.version = -1`, and so on. Each must fail with a check violation because the migration added `CHECK` constraints. The point isn't just "the API rejects -1" (that's a later task) — it's that the **database** rejects it, so there's no code path that can write garbage.
- **Bounds on quantity and tax (23514):** `quantityOnHand` must be `BETWEEN 0 AND 1000000`; `taxRateBps` must be `BETWEEN 0 AND 10000`. Note `quantity` on `InvoiceItem` starts at 1, not 0 — a zero-line-invoice is a data error.
- **Date ordering (23514):** `dueDate >= issueDate` is enforced in the migration, catching leap-year/date bugs at the storage layer.
- **The overflow trap (23514):** this is the one worth calling out. `lineTotal` must equal `unitPrice * quantity`, but both operands can be within bounds (`unitPrice = 2147483647`, `quantity = 1000000`) and their product **still** overflows 32-bit. The constraint casts to `bigint` for the comparison: `"lineTotal"::bigint = "unitPrice"::bigint * quantity::bigint`. The test sets exactly that dangerous pair and asserts rejection — proving the overflow is caught. A naive `CHECK ("lineTotal" = "unitPrice" * quantity)` would wrap around and *pass*, shipping a silently-corrupted total.
- **Integer purity (22P02):** updating `unitPrice` to the string `'1.5'` fails with `invalid_text_representation` — the column is genuinely `INTEGER`, not a float that silently accepts fractions. Same test confirms `'2147483648'` (one above `MAX_INT`) fails with `22003` (numeric value out of range).
- **SKU uniqueness after soft-delete:** you can `UPDATE Product SET "deletedAt" = now()`, but a second INSERT of the same `(userId, sku)` — even reusing the deleted row's own values — fails with `23505` (unique violation). This preserves the invoice reference (I4: "deletion preserves invoice") while keeping the SKU unavailable to its owner.
- **Cross-owner SKU reuse:** a *different* user may reuse the same SKU, so the unique index is on `(userId, sku)`, not `sku` alone. The test inserts an `other` user and confirms the duplicate succeeds — proving the index key is correct.
- **Deletion rules (23503):** `Product` and `User` deletions are refused by foreign-key `RESTRICT` (an invoice may reference the product; a user owns data). But **deleting an invoice cascades only to its items** — after `DELETE FROM "Invoice"`, the test asserts `InvoiceItem` is empty but `Product` is untouched.

### Group 3 — "Real persistence and real transactions" (4 tests)

`N1 V6: real Prisma persistence and atomicity` is where the lazy client and the retry helper earn their keep.

- **Singleton + cross-connection visibility:** confirms `getPrisma()` returns the same instance, writes data on one client, and a *separate* `PrismaClient` on a separate connection sees the committed row. This is the "is the singleton wired to a real database" proof — not just that the function returns something, but that the something talks.
- **Rollback on late failure:** inside `withSerializableRetry`, the callback decrements a product's stock, issues the invoice status, then *throws* after the writes. The test asserts the final error propagates **and** the database state is unchanged — stock back to 10, version 0, status `DRAFT`, version 0. Crucially, it also asserts the callback body ran under `SHOW transaction_isolation = 'serializable'`, proving the isolation level the helper claims to set is actually in effect.
- **A real serialization conflict is retried:** this is the one concurrency test. It starts a retryable transaction, has it read a product, then — from a second, *parallel* writer — mutates that same row, forcing the first transaction into serialization conflict territory. The helper retries automatically, the product ends at the expected quantity (8, not 7 — proving no update was lost), and `attempts` is exactly 2. This is the live proof that "recognized conflicts only, at most three attempts" actually behaves as documented. (Vitest runs with `fileParallelism: false` per T00's config, so the two writers in this test are intentionally raced — the plan carves out concurrency tests as the exception.)
- **BetterAuth schema parity:** this compares T01's auth tables against the *real* `@better-auth/core/db` descriptor exported by the installed BetterAuth 1.7.5. It imports BetterAuth's own `getAuthTables({})`, iterates every field it expects on `user`/`account`/`session`/`verification`, and checks the corresponding column exists in PostgreSQL with the right `data_type` and nullability. The test also round-trips a credential record and a session, and confirms the email uniqueness constraint (`P2002` on duplicate). This is how A1 is actually verified: not by re-typing the spec from memory, but by diffing against the library that will later try to use the tables.

### Group 4 — "Don't fake what you haven't built" (0 tests here, but enforced)

T01 deliberately does **not** contain any auth/server.ts, seed, or HTTP code. No stub `better-auth` wrapper is committed to make a future test pass. The seed command is *declared* in `prisma.config.ts` (`tsx prisma/seed.ts`) but the file does not exist yet — T03 owns it. This is the "no import-time DB access" and "no fake exports" discipline from the plan and skill in action.

---

## File 2: `tests/unit/transaction.test.ts` (6 tests, mocked — no DB)

`V6: bounded serializable transactions` covers the retry helper's *control flow* with a mocked `$transaction`, because that's about decision logic, not PostgreSQL behavior.

- **Is the isolation level right, and is the callback handed a transaction object?** The first test asserts `$transaction` is called with `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }` and that the work callback receives the `TransactionClient` it returns. This is the contract every service call will depend on.
- **Retry-then-succeed (3 calls):** two simulated `P2034` conflicts, then success. Asserts the helper actually loops and eventually returns the value.
- **Exhaustion rethrows the same error (3 calls):** three failures and the helper gives up — but it throws the **exact same error object**, not a wrapped one. That identity matters because T02 maps it to 409, and the plan specifies "rethrow a recognized Prisma error" precisely so the downstream mapper can inspect `code === 'P2034'`.
- **Nonretryable errors fail fast (1 call each, 3 cases):** a plain `Error` (application bug), a bare `{ code: 'P2034' }` (not a Prisma error instance), and a `P2002` uniqueness error (a real Prisma error, wrong code). All three must NOT retry — the `instanceof Prisma.PrismaClientKnownRequestError` + `code` check is what gates retries.

**The why:** real PostgreSQL proves *atomicity and persistence* (File 1); mocks prove the *retry decision logic* in isolation, fast and deterministic, without needing concurrency orchestration. The two files cover the two kinds of truth the helper must satisfy.

---

## Files created/changed (read-only evidence)

- `prisma/schema.prisma` (132 lines) — 7 models + `InvoiceStatus` enum; `prisma-client` generator with explicit output `../generated/prisma`; auth models use BetterAuth's table naming and cascade-on-delete to User; domain models use UUID PKs.
- `prisma/migrations/20260918000100_init/migration.sql` (190 lines) — generated DDL plus the hand-appended CHECK constraints (price/stock/version bounds, date ordering, bigint-overflow-safe line-total product).
- `prisma/migrations/migration_lock.toml` — `provider = "postgresql"`, frozen so `migrate` won't silently switch providers.
- `prisma.config.ts` — `defineConfig` from `prisma/config`; schema path, migrations path, and explicit seed command.
- `lib/prisma.ts` (17 lines) — `getPrisma()` lazy singleton on `PrismaPg`; throws if `DATABASE_URL` is unset; caches on `globalThis` in non-production only; critically, **no Prisma method is called at module scope**, so importing this module never opens a connection.
- `lib/services/transaction.ts` (16 lines) — `withSerializableRetry` loop: Serializable `$transaction`, retry only `P2034`, 3 total attempts, rethrow unchanged.

---

## The transferable lessons

1. **Test what you claim to constrain.** A constraint is only real if you have a test that fails when it's absent. The 17 initial reds proved the CHECKs were doing the work, not theater.
2. **Integer overflow is not theoretical.** `2147483647 * 1000000` overflows 32-bit. If money is involved, cast to `bigint` in the CHECK and test the dangerous boundary.
3. **Compare against the library, don't re-spec it from memory.** A1 is verified by importing BetterAuth's own table descriptor and diffing its nullability/types against your columns — not by hoping your hand-written schema matches.
4. **Mock the decision, integrate the truth.** Use mocks for "does it retry the right error" (fast, deterministic) but run real PostgreSQL for "does it actually roll back / commit / retry a real conflict." The plan deliberately forbids mock-only atomicity claims.
5. **Freeze migration history.** The initial migration is immutable history once committed; adding CHECK constraints to the *initial* migration is fine (nothing depends on it yet), but a later task that needs a new constraint must add a *new* migration, never edit or revert old ones.
6. **Make the unsafe choice impossible, not just discouraged.** `unitPrice` is `INTEGER`, so `'1.5'` throws at insert even if some future API layer forgets to validate — defense in depth at the layer that can't be bypassed.
7. **Don't fake what you haven't built.** No stub auth wrappers, no placeholder seed file — T01 proves the schema exists without pretending the next task's code is done.
8. **Fail-fast in helpers, retry-only-the-recognized-conflict.** Exhaustion must rethrow the *same* object so the contract owner (T02) can branch on it; non-`P2034` errors must not retry, so a genuine application bug isn't masqueraded as a transient conflict.
