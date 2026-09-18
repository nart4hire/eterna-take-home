# T03 — Authentication API and seed

Status: REVIEW
Owner: T03 worker (chat dispatch "implement T03" → implementation, commits and task-branch push authorized; main merge NOT authorized)
Depends on: T01, T02
Requirement IDs: A1, A2, A3, A4, A5, A6, A7, A9, N3, N6
Branch / worktree / base SHA: `task/T03-auth` / `/home/areion/projects/eterna-take-home/.worktrees/T03-auth` / `a25c78fe8a565a3d96ddc7a1b3610327f4aa3e07` (= fetched `origin/main` at creation)
Accepted dependency revisions: T01 approved task tip `a19d7c8edbe260a7086e101bd34f06e6d2f9452c` (tested merge `b801d3ae93e7cbca1e4f659bd17e375609fcf7de`) and T02 approved task tip `fc14c2bb8f344bdcfd6ec0bf4f84f8860067ba41` (tested merge `3f6a1d136e4a79df5d5b3f0840ef06cbfba99261`); both tips verified as ancestors of fetched `origin/main` `a25c78f` by `git merge-base --is-ancestor` (exit 0) before branch creation.

## Scope and ownership

All changes are inside T03 graph-owned paths (`lib/auth/**`, `app/api/auth/**`, `prisma/seed.ts`, `tests/helpers.ts`, `tests/integration/auth.test.ts`, `tests/integration/seed.test.ts`) plus this card. No T00/T01/T02-owned file, manifest, lockfile, schema, migration or shared contract was modified; no fake auth exports or placeholder features were added.

One user-directed change sits outside the graph-owned paths and is reported rather than assumed: `agent_explanations.md` was split (at the user's explicit request in the dispatching message) into `agent_explanations/T00.md`, `T01.md` and `T02.md` (section bodies byte-identical to the original; H1 changed from `# T0X-slug.md` to `# T0X-slug`), and the monolith was removed. That is commit `38e3ff3` and is separate from the auth work, so the coordinator can drop or relocate it if it conflicts with central documentation ownership.

Resource note: this dispatch authorized the task whose card validation requires the postgres-test lease. No other worktree/branch existed, no competing test processes were running, and the shared `stockflow-postgres-test-1` service (127.0.0.1:5433, tmpfs) was already healthy, so the lease was exercised without contention. **If a formal lease record is required, treat this card as the request/record.** Docker needs `sg docker -c` in this session; shared Compose services were never torn down and no workflow file was added.

## Acceptance and test design

- **A1/A5 (registration):** normalized email (trim + lowercase) and uniqueness across case variants; strict body (unknown key `userId` → 422); malformed/non-JSON bodies → 400 `INVALID_JSON`; registration forwards **no** `Set-Cookie` and leaves **no** session row ("disable automatic sign-in" is enforced in the database, not just in the response).
- **A4 (hashing):** stored credential is a verifiable bcrypt hash at cost 12 with a distinct salt per account; the plaintext never appears in the row.
- **A5 (policy):** 8-code-point minimum and 72-UTF-8-byte ceiling, exercised both directly (`validatePassword`) and through the register route (`😀`×8 ok, `😀`×7 rejected, `é`×36 ok, `é`×37 rejected, 73 ASCII bytes rejected).
- **A9 (no enumeration):** wrong password and unknown email return byte-identical 401 bodies (`INVALID_CREDENTIALS`) with no cookie and no session row.
- **A2/A3 (sessions):** one `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` session cookie, expiry validated against PostgreSQL (an expired token whose signature is still valid is rejected because the cookie cache is off), fixed (non-sliding) expiry, logout revokes immediately including a copied cookie, repeated/absent-session logout stays a harmless 204, and re-login still works.
- **N6 (origin/errors):** mutating auth routes call `assertSameOrigin` first, so foreign, missing, trailing-slash, `.evil` suffix and `"null"` origins → 403 `ORIGIN_REJECTED` before any write; guards (`getSessionUser`/`requireAuth`) return one sanitized 401 and never expose tokens.
- **N3 (seed):** seed-twice test written first; one demo owner + five products, README credentials authenticate through the real login/session routes, reruns preserve stock, names, soft deletion and password hashes (no reset), and production is refused before any connection.
- **A6/A7 contribution:** `requireAuth` 401 behavior and owner-scoped fixture helpers exist here; endpoint-specific A6/A7 cases remain T05–T07 work and are not claimed by T03.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Auth configuration/wrappers/session guards | VERIFIED | `lib/auth/password.ts` (`BCRYPT_COST` 12, 8-code-point/72-byte policy, `hashPassword`/`verifyPassword`); `lib/auth/server.ts` (`getAuth()` lazy singleton, Prisma adapter, bcrypt hash/verify, 7-day `expiresIn`, `disableSessionRefresh`, `cookieCache: {enabled:false}`, `trustedOrigins` = configured origin, secure cookies only over https); `lib/auth/session.ts` (`getSessionUser`/`requireAuth`/`requirePageUser`, public fields only); four explicit routes `app/api/auth/{register,login,logout,session}/route.ts` (`runtime = "nodejs"`, no catch-all mounted) | `0119110` |
| Bcrypt/session/origin integration tests | VERIFIED | `tests/integration/auth.test.ts` 26 tests across A1/A2/A3/A4/A5/A9/N6 against real PostgreSQL + real BetterAuth + real route handlers; `pnpm test integration` 55/55 (25 T01 + 26 auth + 4 seed), exit 0 | `0119110` |
| Idempotent PostgreSQL seed and fixtures | VERIFIED | `prisma/seed.ts` (`seed()`, demo owner + five products, empty `update` upserts, production refusal, `finally` disconnect, CLI entrypoint sets exit code); `tests/integration/seed.test.ts` 4 tests; real `pnpm db:seed` CLI run twice (exit 0/0; 1 user / 5 products / 0 sessions; renamed stock preserved at `CLI Renamed`/7) and `NODE_ENV=production pnpm db:seed` exit 1 with "Refusing to seed demo data with NODE_ENV=production" leaving the database unchanged; `tests/helpers.ts` (`registerAndLogin`, `createProductFixture`, `makeRequest`, `uniqueEmail`, `sessionCookieFrom`, `withCookie`, `readErrorBody`) | `0119110` |

## Validation

Environment: postgres-test lease (127.0.0.1:5433/stockflow_test tmpfs), `pnpm install --frozen-lockfile` in the worktree, `prisma generate` + `migrate deploy` (no pending migrations, T01 migration frozen), local git-ignored `.env` created from `.env.example` with a locally generated 64-hex auth secret.

Red evidence (tests written first):
- `pnpm exec vitest run tests/integration/auth.test.ts tests/integration/seed.test.ts` → exit 1, both files failed with missing `@/app/api/auth/*` and `@/prisma/seed` modules (not counted as behavioral red).
- After wiring the routes **without** origin enforcement and **without** disabling automatic sign-in: exit 1, **19 passed / 7 failed** with exactly the intended behavioral failures — `expected [ Array(1) ] to deeply equal []` (register forwarded a cookie), `expected 2 to be +0` and `expected 1 to be +0` (leftover sessions), `expected [ {…} ] to have a length of 1 but got 3` (two extra sessions), and three `expected 201/204 to be 403` origin cases.
- Two test-side over-strict assertions (session *totals* counted the fixture's own login) were corrected to assert the delta/unchanged invariant rather than the implementation being loosened.

Green evidence (same revision as the committed files, `0119110`):
- `pnpm exec vitest run tests/integration/auth.test.ts tests/integration/seed.test.ts` → exit 0, 30/30.
- `pnpm test integration` (runner: test Compose up --wait, `prisma generate`, `migrate deploy`, serial vitest) → exit 0, 3 files, **55/55** (no T01/T02 regressions).
- `pnpm test unit` → exit 0, 7 files, **67/67** (T03 adds no unit tests).
- `pnpm lint` → exit 0. `pnpm typecheck` → exit 0. `pnpm build` → exit 0 (route table shows `ƒ /api/auth/{login,logout,register,session}`).
- `git -c pull.ff=false -c pull.rebase=false pull --no-rebase --no-edit origin main` → "Already up to date." exit 0 (origin/main `a25c78f` unchanged since branch creation, so no rework branch was needed); gates rerun afterwards on the same content.

Environment observation for the coordinator (not a T03 defect, no file owned by T03 is implicated): with `NODE_ENV` **exported in the shell** as `development`, `next build` aborts while prerendering Next's internal `/_global-error` with `TypeError: Cannot read properties of null (reading 'useContext')` plus Next's "non-standard NODE_ENV" warning. Builds exit 0 when the shell does not export `NODE_ENV`, including when `.env` contains `NODE_ENV=development` (verified with `env -u NODE_ENV bash -c '… pnpm build'`). A code-free baseline could not be established for this failure: the baseline attempt failed earlier at `next build`'s TypeScript stage because the committed tests still imported the temporarily moved modules, so the evidence for the cause is the presence/absence of the exported variable rather than a "template-only" run. The worker's local `.env` therefore keeps `NODE_ENV` commented out; `.env.example` (T00-owned) was left untouched.

## Contract notes for successors (T04–T10)

- **Routes** (all `runtime = "nodejs"`, JSON bodies, `assertSameOrigin` first on POST):
  - `POST /api/auth/register` `{email, password}` → **201** `{data:{id,email,name}}`, duplicate → **409** `REGISTRATION_FAILED`, invalid → **422** `VALIDATION_ERROR` with field paths, non-JSON → **400** `INVALID_JSON`, foreign/missing origin → **403** `ORIGIN_REJECTED`. **Never sets a cookie**: BetterAuth's automatic sign-in is revoked server-side, so no session row remains. `name` is derived from the email local part (`RegisterInput` has no name field).
  - `POST /api/auth/login` `{email, password}` → **200** `{data:{id,email,name}}` plus the session cookie; wrong password/unknown email → **401** `INVALID_CREDENTIALS` (identical body).
  - `POST /api/auth/logout` **requires an empty JSON body (`{}` with `content-type: application/json`)** and the same-origin header → **204** empty body, plus cookie-clearing `Set-Cookie` headers; harmless when there is no/expired session.
  - `GET /api/auth/session` → **200** `{data:{id,email,name}}` (`cache-control: no-store`) or **401** `UNAUTHORIZED`; never returns tokens, expiry or hashes.
- **Cookie (BetterAuth 1.7.5, dev/http origin):** `better-auth.session_token`; attributes `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`; no `Secure` over http; over https the `__Secure-` prefix is added automatically (documented for Swagger/README by T10). Only this one cookie is set on login, because the cookie cache is disabled. Logout/session expiry clear the session, `session_data` and `dont_remember` cookies.
- **Session behavior:** 7-day absolute lifetime, refresh disabled (a session read never extends `expiresAt`), validation always hits PostgreSQL, so revocation/deletion takes effect on the next request.
- **Fixtures (`tests/helpers.ts`):** `registerAndLogin({email?,password?}) → {user, cookie, email, password}` (real route calls; `cookie` is `better-auth.session_token=…`), `createProductFixture(userId, overrides?) → ProductDto` (direct Prisma insert, unique SKU/name, `unitPrice` 1299 / `quantityOnHand` 25 by default), `makeRequest(path, init)` (re-exported from the T00 harness, sets `origin: http://localhost:3100` and JSON content-type for string bodies), `withCookie(cookie, init)`, `sessionCookieFrom(response)`, `uniqueEmail(prefix?)`, `readErrorBody(response)`, `FIXTURE_PASSWORD`.
- **Seed (N3) for README/Swagger (T10):** `pnpm db:seed` → demo owner `demo@stockflow.local` / `StockFlowDemo!2026` (password hash produced by `lib/auth/password.ts`, verified by a real login through `POST /api/auth/login`), five demo products `DEMO-001`…`DEMO-005`, reruns preserve edited stock/names/prices/soft deletion and never rewrite a password; `NODE_ENV=production pnpm db:seed` exits 1 without touching the database.
- **Implementation notes:** `prisma/seed.ts` cannot import `lib/prisma.ts`/`lib/auth/server.ts` (both `import "server-only"`, which throws under plain `tsx`); it builds a client from the same generated `PrismaClient` + `PrismaPg` adapter and reuses `lib/auth/password.ts`. `getAuth()` options are typed as `BetterAuthOptions` (the literal type breaks `ReturnType<typeof betterAuth>` assignability) and the instance is cached on `globalThis` outside production only. `lib/auth/session.ts` imports `next/headers`/`next/navigation` for `requirePageUser()` only; route code and tests use the header-parameter guards.

## Proposed coordinator updates (central files are read-only to workers)

1. **Memory bank / progress / graph:** T03 deliverables are complete at task-branch HEAD but **not accepted**; the dashboard row should stay `TODO`/`REVIEW` until the coordinator merges and verifies. Next eligible task is T04 and/or T05 only after that merge.
2. **Person-responsible note:** the `agent_explanations.md` split (`38e3ff3`) is user-directed work outside T03's graph paths; if the coordinator prefers to own it, keep the commit but record the new `agent_explanations/` paths in the central documentation index.
3. **Environment note:** consider adding a one-line warning for the T10 clean-clone rehearsal if `NODE_ENV` happens to be exported in the shell (build aborts at `/_global-error` prerender). No source or `.env.example` change is requested by T03.
4. **Deferred evidence, not claimed here:** browser/E2E auth flows (F1/F5/F6, T04), endpoint-specific A6/A7 cases (T05–T07), Swagger/OpenAPI documentation of the cookie name and error codes (T10), README demo credentials (T10).

## Handoff

Completed: all three deliverables — auth configuration/wrappers/session guards, real-PostgreSQL bcrypt/session/origin integration tests (A1–A5, A9, N6), and the idempotent seed with shared fixtures (N3).
Remaining (not in T03 scope): browser/E2E auth behavior, endpoint-specific A6/A7 authorization cases, README/Swagger documentation, coordinator acceptance and merge.
Red/green commands and results: see Validation — red = missing modules, then 19 passed / 7 failed behavioral (register cookie, leftover sessions, session count, three 403 origin cases); green = 30/30 focused, `pnpm test integration` 55/55, `pnpm test unit` 67/67, `pnpm lint` / `pnpm typecheck` / `pnpm build` all exit 0, seed CLI runs exit 0/0 and production refusal exit 1.
Implementation/tested SHA: `0119110ffdc82c8dc9cc126a818ccc8ee09740b5` (tests `de56b65`, auth `52e8635`, seed `0119110`; docs split `38e3ff3`) — gated at that exact content, then re-gated (typecheck, lint, unit 67/67, integration 55/55, build, seed-CLI script) after the seed-only refactor `3766919`; the card commits (`1546beb` and this addendum) are documentation-only and changed no executable file. Integrated main SHA: `a25c78fe8a565a3d96ddc7a1b3610327f4aa3e07` (unchanged; pull reported "Already up to date", exit 0).
Uncommitted work: none (working tree clean; local git-ignored `.env` and `generated/` only).
Contract notes: recorded above for T04–T10 (routes/status codes, cookie name and attributes, fixture signatures, seed credentials).
Blockers: none. Limitations: A6/A7/F1/F5/F6/N5/N7 evidence belongs to later tasks; `pnpm exec vitest tests/integration` outside the runner fails closed by design (harness guard).
Push/PR status: pushed as `task/T03-auth` (see chat handoff for the pushed SHA); `main` untouched.
Next action: coordinator reviews the diff/evidence, merges with `--no-ff` and verifies on the merged revision; successors (T04, T05) start only after that.
Coordinator acceptance / merge SHA: Pending (reviewer: coordinator).



