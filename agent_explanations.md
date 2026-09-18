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

# T02-contracts.md

Here's the full walkthrough. First, the framing that makes everything else click:

## The big picture: this task defines the *vocabulary*, not a feature

T00 built the test infrastructure; T01 built the database contract (CHECK constraints, migrations, serializable retries). T02 builds the layer *above* the database that every future request and response passes through: the input schemas, the public response shapes, and four pure helpers (money, environment, HTTP errors, auth forwarding). It adds no route and no table, so it doesn't answer "does creating a product work?" — it answers **"do all the routes we're about to write agree on the same rules, the same money math, and the same error shape?"**

That matters because this is where the app's recurring bug classes get closed *once*: floats silently losing cents, clients smuggling `userId`/`total`/`unitPrice` into a body, two concurrent edits overwriting each other, integer overflow, impossible dates like `2024-02-31`, pagination `skip` values that overflow, several `Set-Cookie` headers merged into one invalid header, and raw database errors leaking SQL to the browser. Every one of those is cheapest to prevent in one shared place — and T02 is that place.

Two design choices before the individual tests:

- **The helpers are pure by construction.** `lib/types.ts`, `lib/validation/schemas.ts` and `lib/money.ts` import nothing from the database, the environment or Prisma, and `lib/env.ts` opens with `import "server-only"` — Next's poison pill that fails the build if a client component ever imports it. That's why these are pure unit tests (no Docker, no database, no network, about a second in total) and why `lib/services/*` in T05–T07 can call `calculateTotals` without dragging config or a connection along.
- **TDD, and the red phase earned its keep.** Beyond the initial missing-module failures, three behavioral reds changed the design: an oversized `quantity` was accepted when `unitPrice` was `0` (the product stayed small), so the quantity bound became explicit instead of implied; a raw `ZodError` from a query parameter surfaced as a sanitized 500 instead of 422, so `errorResponse` learned to map `ZodError`; and the SKU case-normalization ran *after* the length check, so values that grow when uppercased slipped through. None of those was found by reading the code — they were found by running it.

---

## File 1: `tests/unit/validation.test.ts` (8 tests) — the input contract

### Group 1 — "Normalize what the user meant, never guess what they sent" (I3, V2, N6)

`schemas.ts` is the single source of truth: every request type is `z.infer`ed from its schema, so the type and the runtime check can never drift apart. The first test pins two opposite behaviors: `sku: " abc "` / `name: " Product "` come back trimmed and uppercased, but `unitPrice: "0"` (a *string*) is **rejected**. `z.coerce.number()` would have "helpfully" accepted it, and coercion is exactly where `"1e3"`, `""`, `null` and `true` sneak into a money column. The same test loops over `["userId", "deletedAt", "version", "total"]` and asserts each one **breaks the parse**.

**The why, in plain terms:** that loop is the mass-assignment guard. If a client can post `{"sku":"X","userId":"someone-else","unitPrice":0}`, then ownership and money are client-controlled fields. `z.strictObject` refuses unknown keys, and the error handler even names the offending key, so the API answers "unexpected key `userId`" instead of a shrug.

### Group 2 — "Every update carries the version it is updating" (V2)

`updateProductSchema` is `createProductSchema.partial()` plus a **required** `version` plus a refinement demanding at least one mutable field. The tests pin all three edges: `{version: 0}` alone fails (nothing to update), `{name: "x"}` alone fails (no version), and `{version: 0, description: null}` succeeds and yields `description: null`.

**The why:** the "at least one field" rule kills no-op writes that would still bump `version` and hand everyone else a spurious 409. The mandatory `version` is optimistic concurrency — the database compares it and refuses stale writes, so a lost update becomes a clean conflict instead of silent last-write-wins. `deleteProductSchema` requires a version for the same reason.

### Group 3 — "Real calendar dates, checked by round-trip" (I3)

`calendarDateSchema` matches `^\d{4}-\d{2}-\d{2}$` and then re-formats the parsed value back to ISO and compares. The test feeds it `2023-02-29`, `2024-04-31`, `2024-13-01`, `0000-01-01`, `2024-2-01` and a full timestamp — all must fail — while `2024-02-29` (a real leap day) passes.

**The why:** the cheap version of this check is a regex, and a regex happily accepts February 31st. The round-trip catches it because a UTC parse turns `2024-04-31` into `2024-05-01`, which no longer matches the input. Working entirely in UTC is also what stops a server in one timezone from rejecting the date a user picked in another.

### Group 4 — "Pagination arrives as text and still becomes a number" (I3)

Query parameters are strings, so `queryInteger` is a pipeline: `z.string().regex(/^\d+$/)` → `.default(...)` → `.transform(Number)` → `.pipe(z.number().int().min(1).max(...))`. The test throws `["0","-1","1.5","1e3"," 1","","9007199254740992"]` and the raw number `1` at it — every one must fail — while `{page:"2", pageSize:"100", search:" sku "}` parses to `{page:2, pageSize:100, search:"sku"}`. A second guard, `safeOffset`, refines `(page - 1) * pageSize` to a safe integer, and `page:"9007199254740991"` is rejected.

**The why:** that last case is `skip: 9e17` being handed to Prisma — the kind of value that produces a confusing driver error instead of a 422. Bounding it before it reaches the database turns a mystery into a field error.

### Group 5 — "Invoices reject anything derived, and name the offending line" (V2, I3)

`createInvoiceSchema` is strict, so `userId`, `subtotal`, `taxRateBps`, `status` and `total` are all rejected: the server computes those, always. Items are 1–100 entries of `{productId, quantity}` with a `superRefine` for duplicates; the test posts the same product twice (once uppercased, which proves UUID normalization runs *before* the duplicate check) and asserts the error path is `items.1.productId`.

**The why:** "which row is wrong?" is the difference between a usable form and a guessing game. Rejecting a supplied `unitPrice` is the other half: prices are snapshotted server-side from the product row, so nobody can invoice at a price they invented.

### Group 6 — "Passwords are bytes, and they are never trimmed" (the schema T03 reuses)

`registerPasswordSchema` requires ≥8 Unicode code points *and* ≤72 UTF-8 bytes; `loginSchema` enforces only the byte ceiling. The tests use `"😀"×7` (7 code points, 28 bytes → rejected), `"😀"×8` (accepted), `"é"×36` (72 bytes → accepted), `"é"×37` (74 bytes → rejected), and `password: " pass123 "` comes back **untrimmed**.

**The why:** bcrypt silently truncates at 72 bytes, so without this check two different long passwords authenticate the same account — a real, subtle vulnerability. Counting code points rather than UTF-16 units makes `😀` count as the one character a user sees. Trimming is skipped deliberately: a leading space is part of a password, and trimming at registration but not at login is a classic login bug.

---

## File 2: `tests/unit/money.test.ts` (19 tests) — exact cents, one rounding step

`parseMoney` is a digit-by-digit integer parser: `cents = cents * 10 + (charcode - 48)`, bounded after every digit. The tests cover `"0"→0`, `"1.1"→110`, `"0.29"→29`, `"21474836.47"→2147483647`, and reject `""`, `"-1"`, `"+1"`, `"1e2"`, `".1"`, `"1."`, `"1.001"`, `" 1 "`, `"21474836.48"` and a 100-digit string.

**The why:** `parseFloat("0.29") * 100` is `28.999999999999996`. Any cents math that goes through a float eventually disagrees with itself, so money is parsed and computed as integers; the only float in the whole task is inside `formatMoney`'s `(cents / 100).toFixed(2)`, which is safe because cents ≤ 2147483647.

`calculateTotals` applies tax **once, half-up, on the subtotal**: `numerator = subtotal * taxRateBps`, then `Math.floor(numerator / 10000) + (numerator % 10000 >= 5000 ? 1 : 0)`. The tests prove it is *not* per-line (two 5¢ lines at 10% → subtotal 10, tax **1**, not 2), that 1100 bps on a 200¢ line is 22¢, and that the money maximum passes with zero tax.

**The why:** rounding each line and adding differs from rounding the sum once. The plan fixes one of those, and a test that only asserted `total` would not notice which one you implemented. Every bound — line total, subtotal, tax numerator, final total — throws `AppError(422, "ARITHMETIC_BOUNDS")` rather than returning `Infinity` or a rounded lie. The case that first failed here was a huge `quantity` with `unitPrice: 0`: the product was tiny, so nothing looked wrong until the quantity itself was bounded on purpose.

---

## File 3: `tests/unit/env.test.ts` (3 tests) — configuration that refuses to be wrong

`readEnv(source)` takes the environment as an **argument**. That's the whole trick: no module-scope `process.env` read, so importing `lib/env.ts` never touches real secrets and the test can hand it a literal object. The first test asserts the exact returned shape (`databaseUrl`, `authUrl`, `authSecret`, `nodeEnv`, `taxRateBps`) and that an omitted `TAX_RATE_BPS` becomes **1100** — the plan's 11% default.

The second test removes each required variable in turn and asserts a throw, then feeds three placeholder secrets — the literal `REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS` from `.env.example`, `"change_me"` repeated, and 40 spaces — and asserts all are rejected. Finally, inside a `try/catch`, it asserts the thrown string contains **neither the database URL nor the secret**.

**The why:** a placeholder that boots successfully is the most common way a demo deploy ends up running on public credentials. The non-disclosure assertion turns "we don't log secrets" from an intention into a property: the error names the variable (`Invalid server configuration: BETTER_AUTH_SECRET`) and nothing else, so a stack trace can't leak the value.

The third test covers malformed URLs and modes: `mysql://localhost/db`, `postgresql://localhost` (no database name), `postgresql:///db` (no host), and `BETTER_AUTH_URL` values with a path, query string, credentials or the wrong scheme. It also casts `"staging"` through `as unknown as NodeJS.ProcessEnv` to prove that even a value TypeScript thinks is impossible is rejected at runtime.

**The why:** `BETTER_AUTH_URL` has to be a bare origin, because `assertSameOrigin` compares it *character-for-character* against the `Origin` header. A trailing slash in configuration would silently 403 every mutating request; catching it at startup turns a week of confusing 403s into one clear error.

---

## File 4: `tests/unit/http.test.ts` (6 tests) — one error shape, safe by default

### "A schema failure is the client's fault; a crash is ours" (N6)

`readJson` separates two failures a naive implementation merges: a malformed body or non-JSON `content-type` is **400 `INVALID_JSON`**, while a well-formed body that fails the schema is **422 `VALIDATION_ERROR`** with indexed paths (`items.0.quantity`, or `_root` for the whole body). Another assertion proves a `ZodError` thrown *directly* by a route — a query parameter parsed by hand — also becomes 422, not 500. That was the second behavioral red.

Then `errorResponse` is tested against four inputs in one loop: a real `AppError(404)`, a Prisma-shaped conflict, a plain `Error("secret password")`, and an `AppError(500, "INTERNAL", "secret SQL")`. The first passes through; the last two come back as the **same sanitized** `{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}`, with the test asserting no trace of "secret password" or "secret SQL".

**The why:** "your JSON is broken" (400) and "your JSON is wrong" (422) are distinctions a form can act on. Sanitizing a thrown 5xx `AppError` too is deliberate — a service that throws `AppError(500, "INTERNAL", sqlMessage)` has just leaked schema details, so only *4xx* codes are trusted to be user-safe.

### "The transaction conflict crosses the layer boundary as a value, not an import" (N6, V2)

This is the seam with T01. `withSerializableRetry` rethrows the *same* `PrismaClientKnownRequestError` when its three serializable attempts fail, and T02 must turn that into **409 `TRANSACTION_CONFLICT`** — without importing Prisma or the generated client, which would drag the database into a "pure" helper and break the unit-test path.

So the check is **structural**: `name === "PrismaClientKnownRequestError" && code === "P2034" && typeof clientVersion === "string"`. The test builds that object by hand and expects 409, then feeds a bare `{ code: "P2034" }` — a shape a request body could try to spoof — and expects **500**.

**The why:** this is dependency inversion on an error object. T02 doesn't need to know Prisma exists, only to recognize one recognizable value, and the negative case stops the recognition from over-matching (matching on `code` alone would turn any stray object into a 409 and hide real bugs).

### "Origin is compared to configuration, never to the request" (N6)

`assertSameOrigin` is given `BETTER_AUTH_URL=https://stockflow.example`, then requests whose `Host` is `attacker.example` with `Origin` values of the legit value, `undefined`, `"null"`, `https://attacker.example`, `https://stockflow.example/` and `https://stockflow.example.evil`. Only the exact match passes; everything else is 403 `ORIGIN_REJECTED`.

**The why:** comparing `Origin` to `Host` is the tempting shortcut and it makes CSRF protection meaningless, because the attacker controls both. The trailing-slash and `.evil` cases exist because "starts with" and "contains" comparisons are how origin checks get bypassed in the wild — `stockflow.example.evil` is exactly the string a `startsWith` check would wave through.

### "Auth responses are re-wrapped, and cookies survive individually" (N6)

Two tests push a *fake* BetterAuth response through `forwardAuthResponse`. On success it returns **only** `{id, email, name}` — the input deliberately carries `password` and `token`, and neither appears in the output. `register` becomes 201; `logout` becomes 204 with an empty body.

The cookie assertion is the interesting one: two cookies are appended (`session=abc; Path=/; HttpOnly` and one carrying `Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/`), and the forwarded response's `getSetCookie()` must equal exactly those two strings.

**The why:** forwarding cookies by re-setting a single `set-cookie` header joins them with a comma, and the second cookie is then mangled, because `Expires` itself contains a comma. That's the classic "why does my second cookie vanish?" bug. Using `getSetCookie()` and appending each one keeps the headers separate, and the test uses a date-bearing cookie specifically so the failure can't hide. The failure mapping is pinned too: 400/401/404 on login all become a generic 401 `INVALID_CREDENTIALS` (no account enumeration), 422 on register becomes 409 (duplicate email), 403 and 429 pass through, and a 200 without a user object becomes a sanitized 500 rather than a half-broken session.

---

## Files created (read-only evidence)

- `lib/validation/schemas.ts` (54 lines) — 12 strict input schemas plus the inferred `*Input` types every route will share.
- `lib/types.ts` (45 lines) — DTOs (`ProductDto`, `InvoiceSummaryDto`, `InvoiceDetailDto`, `InvoiceItemDto`, `MoneyTotals`, `Page<T>`, `ApiErrorBody`, `SessionUser`, `InvoiceStatus`) in integer cents and ISO/calendar-date strings, re-exporting the input types so callers have one import.
- `lib/money.ts` (50 lines) — `parseMoney`, `formatMoney`, `calculateTotals`.
- `lib/env.ts` (25 lines) — `readEnv`, behind `server-only`.
- `lib/http.ts` (81 lines) — `AppError`, `dataResponse`, `readJson`, `assertSameOrigin`, `errorResponse`, `handleRoute`, `forwardAuthResponse`.

---

## What I deliberately did *not* test here

No route handlers, no Prisma import, no session logic: T02 imports no database module at all, so its tests run without Docker. BetterAuth is exercised through a hand-built `Response`, never a real sign-up — **T03 verifies actual auth forwarding**, revocation and schema compatibility against the real thing. Likewise, the P2034 mapping is proven against a hand-made error object; that Prisma 7.9.1 really throws that shape after T01's retries is T01/T03 territory. The DB-dependent checks are recorded as deferred on the card rather than dressed up as integration proof.

---

## The transferable lessons

1. **Validate at the boundary, once.** One strict schema per endpoint input beats scattered `typeof` checks, because the schema is simultaneously the document, the TypeScript type and the test fixture.
2. **Reject what the server derives.** Ownership, totals, status and prices never come from the client; `strictObject` turns "we trust clients not to send this" into a parse failure.
3. **Never let a float touch money.** Parse digit-by-digit, compute in integer cents, and round exactly once at the step the plan names.
4. **Bounds are features.** Every 422 `ARITHMETIC_BOUNDS` is a bug class that can no longer be reported as "the totals look weird".
5. **Fail closed on configuration.** Refuse placeholders and malformed URLs at startup, name the variable and never the value.
6. **Sanitize by default; trust only 4xx.** Anything unexpected becomes an opaque 500, so no SQL, secret or stack detail leaves the process.
7. **Recognize errors by shape when you can't import them.** The structural P2034 check keeps the helper pure while still converting T01's retry exhaustion into a 409 — and the negative test is what stops that recognition from over-matching.
8. **Compare identity, not substrings.** Origin equality against configuration is a real CSRF control; `startsWith` is how origin checks get bypassed.
9. **Re-emit multi-value headers individually.** `getSetCookie()` + `append` preserves every cookie; a single joined `set-cookie` header corrupts the ones containing commas.
10. **A test proves something only when it distinguishes the right answer from a plausible wrong one.** "Tax once on the subtotal" is meaningful precisely because two 5¢ lines give 1¢ and not 2¢.

