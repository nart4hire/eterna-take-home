# TOO-toolchain.md

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

All of this is verifiable yourself: check out `task/T00-toolchain`, run `pnpm test unit` (fast, no Docker needed), or read the two files — every test name starts with a `T00-H*` identifier mapping back to the task card's requirements.