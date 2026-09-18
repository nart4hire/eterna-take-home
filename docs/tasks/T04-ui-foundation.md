# T04 — UI foundation and authentication screens

Status: REVIEW
Owner: T04 worker (chat dispatch "Let's implement T04" → implementation, commits and task-branch push authorized; main merge NOT authorized)
Depends on: T03
Requirement IDs: F1, F5, F6
Branch / worktree / base SHA: `task/T04-ui-foundation` / `/home/areion/projects/eterna-take-home-2/.worktrees/T04-ui-foundation` / `14e8b7134cadeb9f348b35fb361d70575f374b29` (= fetched `origin/main` at creation)
Accepted dependency revisions: T03 approved task tip `bcad7789fead68f035d478815efce380b012f036` (tested merge `3e38219630b8d4ff7f1ef151eec85c87820dabd8`); both verified as ancestors of fetched `origin/main` `14e8b71` with `git merge-base --is-ancestor` (exit 0) before the branch was created. T01/T02 arrive through T03's reviewed tip.

> **Requirement amendment (user, 2026-09-18, revision 2 — consolidates and supersedes the first scope note on this card): Playwright is removed from the application, and UI work is explicitly not test-driven.** `project.md` §6 lists E2E as a bonus item; the user has now placed it permanently out of scope, so the whole Playwright layer was deleted rather than deferred — `playwright.config.ts`, the `@playwright/test` dependency and its lockfile entry, the `test:e2e` script, the runner's `e2e` subset, the `next-e2e` port lease and every `tests/e2e/**` ownership entry (T04, T08, T09, T10). The first amendment on this card (`tests/e2e/auth.spec.ts` written, run once against a real dev server, then deleted) is therefore fully consolidated: no browser-test deliverable exists anywhere in the plan, graph or cards. Because automated UI/browser tests are no longer part of the app, T04's UI is **not** test-driven: the logic that is cheap to test stays covered by unit tests (client helper) and by the already-merged integration suites (database, auth, seed), while the rendered UI is verified by the documented **reviewer verification checklist** below, which T08/T09 extend for their own screens. F1/F5/F6 consequently move from "browser-test asserted" to "checklist-verified at review time"; the API and guard behaviour behind them stays test-backed.
>
> **Docker and Compose authorization (user, 2026-09-18):** T04 — together with T08 and T09 where necessary — is additionally authorized to do the container work that previously sat outside every card: a deliberately simple `Dockerfile`, a `.dockerignore`, and an `app` service in `docker-compose.yml`. The container must use the versions pinned in `mise.toml` (Node 24.21.0, pnpm 12.4.2) and must support the workflow "clone, populate env where necessary, `docker compose up`" on a freshly cloned repository (migrations and demo seed included, so the seeded credentials from `prisma/seed.ts` work immediately).
>
> Ownership: carrying this out required edits to T00-owned paths (the harness runner `scripts/test.ts`, `package.json` and the lockfile, `.gitignore`, `eslint.config.mjs`, and the deletion of `playwright.config.ts`) plus `docker-compose.yml`; the user authorized that explicitly. The graph records the change as `scope_amendments`/AMEND-T04-1, with `Dockerfile`, `.dockerignore` and `docker/**` added to T04's `owns` and `docker-compose.yml` kept under T00 with T04/T08/T09 as authorized editors.
>
> Decision: the `app` container runs the built application (`next build` in the image, `next start` at runtime) rather than a development server, because the requirement is deployability. Decision: the image installs the full dependency set (not `--prod` only) in a single stage, because the same image must run `prisma migrate deploy` and the `tsx` seed — this is accepted as the "keep it simple" trade-off and is recorded below. Decision: startup validates `BETTER_AUTH_SECRET` (compose requires it, the entrypoint rejects the `.env.example` placeholder) before migrating and seeding, so a fresh clone cannot silently serve a half-configured app.

> **Worker PRIMARY:** this session's checkout is `/home/areion/projects/eterna-take-home-2` (`git rev-parse --show-toplevel`); every documented `/home/areion/projects/eterna-take-home/...` prefix was rebased onto that checkout and its `.worktrees/T04-ui-foundation` child. The other checkout (`/home/areion/projects/eterna-take-home`) was only read, never written.

## Scope and ownership

All changes are inside T04 graph-owned paths plus this card: `components.json`, `components/ui/**`, `lib/utils.ts`, `lib/client-api.ts`, `components/auth-form.tsx`, `components/logout-button.tsx`, `components/pagination.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/error.tsx`, `app/not-found.tsx`, `app/(auth)/**`, `app/(dashboard)/{layout,loading,error}.tsx`, `tests/unit/client-api.test.ts`. No T00/T01/T02/T03-owned file, manifest, lockfile, schema, migration, contract or shared helper changed; no product/invoice page and no temporary placeholder route was created (`app/(dashboard)` intentionally has no page).

## Acceptance and test design

- `lib/client-api.ts`: same-origin JSON fetch for client forms, `204` handling, `ApiClientError` with status/body/fields, a sanitized fallback for non-contract failures (proxy HTML, empty bodies), network failures reported as status 0, and a 401 redirect to `/login` for protected endpoints only — login/register 401s must stay inside the form.
- `AuthForm`: register/login modes, real server errors plus per-field messages, `aria-invalid`/`aria-describedby`, `role="alert"` failures, `aria-busy` form with a disabled submit while pending, and values preserved after a failure.
- Server guards: `app/page.tsx` redirects through `requirePageUser()` (database-truthful session, no cookie-only or proxy-only shortcut); the `(auth)` layout sends signed-in visitors to `/products`; the `(dashboard)` layout calls `requirePageUser()` for navigation while each page stays responsible for its own data.
- Boundaries/metadata: root `error.tsx` using the Next 16 `{ error, retry }` props, `not-found.tsx`, `(dashboard)/loading.tsx` (skeleton with `aria-busy`), `(dashboard)/error.tsx` retry boundary, and titles through the root `title.template`.
- Legacy shadcn generators would need new dependencies: none were used — every component is written against the dependencies T00 already installed.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Shared UI/styles/client API/pagination | VERIFIED | `components.json` (shadcn Tailwind v4 config, `@/` alias); `components/ui/{button,input,label,textarea,table,card,badge,alert,alert-dialog,skeleton}.tsx` built from installed dependencies only (cva, Slot, radix label/alert-dialog, lucide-free markup); `lib/utils.ts` `cn`; `lib/client-api.ts` `apiFetch`/`ApiClientError`; `components/pagination.tsx` query-driven links; `app/globals.css` shadcn tokens with system fonts (no network fonts); `app/layout.tsx` metadata | `c3ae38b131986c974926408765a36eca931f0968` |
| Auth pages/layout/logout and boundaries | VERIFIED | `components/auth-form.tsx`, `components/logout-button.tsx`, `app/(auth)/{layout,login/page,register/page}.tsx`, `app/(dashboard)/{layout,loading,error}.tsx`, `app/page.tsx`, `app/error.tsx`, `app/not-found.tsx` | `c3ae38b131986c974926408765a36eca931f0968` |
| Client helper unit tests (E2E dropped by user decision) | VERIFIED | `tests/unit/client-api.test.ts` — 10 tests: 4 success paths, 3 error mappings, 3 session-expiry cases; unit suite 67 → 77 | `c3ae38b131986c974926408765a36eca931f0968` |
| Container deployability: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, compose `app` service | VERIFIED | Fresh-clone rehearsal from the pushed branch (no `node_modules`/`.next`/`generated/`/`.env`): `cp .env.example .env` + a generated secret, then `docker compose -p stockflow-rehearsal up -d --build` → both containers healthy, the entrypoint ran `prisma migrate deploy` and the idempotent seed, `next start` served `/login` 200, `/` → 307 `/login` and the seeded demo login 200; `node --version` 24.21.0 / `pnpm --version` 12.4.2 (the `mise.toml` pins) inside the container; `@playwright/test` absent; the placeholder-secret guard exits 1 before touching the database; Prisma's OpenSSL warning fixed in `f9f3bb9` | `f9f3bb93904718e54ce389f79d7e6f32cab8df5c` |

## Validation

- **Red (first):** `pnpm test:unit` → `Error: Cannot find package '@/lib/client-api' imported from .../tests/unit/client-api.test.ts`, exit 1 (missing module, not a configuration failure).
- **Green at the tested revision (`c3ae38b131986c974926408765a36eca931f0968`):** `pnpm lint` 0 (no warnings); `pnpm typecheck` 0 (`prisma generate && next typegen && tsc --noEmit`); `pnpm test:unit` 77/77 in 8 files (+10 new); `pnpm test:integration` 56/56 against real PostgreSQL (T01 25 + T03 auth 27 + seed 4, unchanged); `pnpm build` 0 with `/` dynamic, `/_not-found` static, `/login` and `/register` dynamic, and the four auth routes.
- **Leases:** only one worktree/branch existed and no competing test process was running; the shared `stockflow-postgres-test-1` service (127.0.0.1:5433) was already healthy and was never torn down. Docker needs `sg docker -c` in this session. This card is the lease request/record, as in T03.
- **Playwright (superseded by revision 2):** the browser suite was attempted during this session and collected zero tests — the committed `playwright.config.ts` (T00-owned) set `testIgnore: ["**/.worktrees/**"]`, which matches every feature-worktree path, reproduced with `pnpm exec playwright test --list` → `Total: 0 tests in 0 files`. The browser binary also lacked native libraries (`libnspr4`, `libnss3`, `libasound2`) and this environment has no root/sudo, so `playwright install-deps` cannot run. Revision 2 resolved the situation by removing the Playwright layer entirely (config, dependency, script, runner subset and lease), so the defect is moot. Nothing from those attempts survives in the repository: the spec, the temporary worktree-only config, `test-results/` and `playwright-report/` were deleted, and only the `~/.local/share/stockflow-playwright-deps` prefix remains outside the repository, unused.
- **Deferred, not claimed green:** the browser-level F1/F5/F6 click-through stays in the reviewer checklist below (no browser phase exists), the loading/error boundaries are wired but no page in this task can throw on purpose, and a hosted deployment URL remains the user's bonus item.
- **Amendment revision 2 — Playwright removal (red/green, verified at `52e4eae`):** red first — `pnpm test:unit` failed T00-H9 (`expected [Function] to throw` for the retired `e2e` subset) and T00-H24 (`expected true to be false` while `playwright.config.ts` still existed), then T00-H25 failed with `ENOENT ... Dockerfile` before the container commit. Green after: `pnpm test:unit` 78/78 in 8 files (+1 net test), `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0 with the same route table, `pnpm test:integration` 56/56 on real PostgreSQL. `pnpm install --frozen-lockfile` no longer installs `@playwright/test` (only next's optional-peer record stays in the lockfile) and bare `pnpm test` now runs exactly unit + integration.
- **Amendment revision 2 — container rehearsal (verified at `f9f3bb9`):** a real `git clone` of the pushed branch — no `node_modules`, `.next`, `generated/` or `.env` — was populated with only `cp .env.example .env` plus a generated `BETTER_AUTH_SECRET`, then `docker compose -p stockflow-rehearsal up -d --build` built the image (`node:24.21.0-bookworm-slim` with pnpm 12.4.2) and started `app` + `postgres`. Results: the app log showed the migration, `🌱  The seed command has been executed.` and `next start` ready; `GET /login` 200; `GET /` 307 → `/login`; `POST /api/auth/login` with the seeded `demo@stockflow.local` credentials 200; `node --version` = v24.21.0 and `pnpm --version` = 12.4.2 inside the container; `node_modules/@playwright/test` absent; the placeholder-secret guard printed its remediation message and exited 1 without running the migration. The first rehearsal run served traffic correctly but logged Prisma's OpenSSL warning against the slim base image, which `f9f3bb9` fixes — re-rehearsed with 0 occurrences. The rehearsal used an isolated Compose project name, so the shared `stockflow-postgres-test-1` service and its data were never touched; the rehearsal containers, image, volume and network were removed afterwards and the temporary clone deleted.
- **UI verification approach at this revision:** no browser suite exists, so F1/F5/F6 rest on the reviewer checklist below plus the unchanged automated evidence for the behaviour underneath them (guards, routes and helpers covered by the merged T03 integration suite and T04's client-helper unit tests).

## Handoff

Completed: UI foundation (shadcn-style components, tokens, system fonts, metadata), client API helper and shared pagination, auth screens, logout, session guards and error/loading/not-found boundaries; 10 new unit tests; the reviewer verification checklist; the repository-wide Playwright removal (`playwright.config.ts`, dependency, `test:e2e`, runner subset, ignores and lease) with harness tests T00-H24/H25; and the container deliverable (`Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, compose `app` service) rehearsed from a fresh clone. No product/invoice page and no temporary placeholder route was created.
Remaining: the browser-level F1/F5/F6 click-through in the reviewer checklist (no browser phase exists), protected product/invoice pages (T08/T09), README/Swagger (T10), coordinator review, acceptance and merge.
Red/green commands and results: see Validation.
Implementation/tested SHA: `f9f3bb93904718e54ce389f79d7e6f32cab8df5c`; branch order is `4c4ce7244c4269524d04bf48da29055cc4d6ae32` (amendment documentation), `7d27a9b15e332f1386bec86bb06fea15bca2de31c` (harness tests), `2af9dd1fe905c1c19dd4cc5e778c3d758c3f4746` (Playwright removal), `52e4eae8caf65da5ceb2ce759b2a7b90df30145a` (container) and `f9f3bb9…` (OpenSSL fix). Revision-1 tested revision: `c3ae38b131986c974926408765a36eca931f0968`. This card commit is documentation-only.
Integrated main SHA: `14e8b7134cadeb9f348b35fb361d70575f374b29` (branch base; origin/main unchanged before the pushes).
Uncommitted work: none (clean working tree; only git-ignored `.next/`, `generated/`, `node_modules/` and `tsconfig.tsbuildinfo` remain).
Contract notes: table below.
Blockers: none. Limitations: no browser/E2E evidence by user decision; the error/loading boundaries are wired but their throw paths are unexercised; `Pagination` needs a real list page (T08/T09); the container image installs the full dependency set (accepted "keep it simple" trade-off) and runs the seed on every start (idempotent).
Push/PR status: `task/T04-ui-foundation` pushed to `origin` at `f9f3bb9`; `main` untouched.
Next action: coordinator reviews the diff/evidence, then merges the branch tip with `--no-ff` and re-verifies; T08 also needs T05, T09 also needs T07.
Coordinator acceptance / merge SHA: Pending.

## Reviewer verification checklist (manual — the UI is not test-driven)

Automated coverage for this task is limited to the client helper (`tests/unit/client-api.test.ts`), the merged database/auth/seed integration suites, and lint/typecheck/build. Everything rendered is therefore checked by a human reviewer in a browser against the steps below. T08 and T09 extend this list for their own screens, and T10 carries the results into the release ledger (`docs/requirements.md`) when it audits F1–F6.

### A. Container path (authorized amendment; evidence recorded by the implementation commits)

- [ ] Fresh clone of the branch, with no `node_modules`, `.next`, `generated/` or `.env` present.
- [ ] `cp .env.example .env` and set `BETTER_AUTH_SECRET` to a random 32-byte hex value (generation command is in `.env.example`); nothing else needs editing for local use.
- [ ] `docker compose up --build` starts PostgreSQL and the app; the app log shows the migration step, the idempotent seed step and then `next start`.
- [ ] `http://localhost:3000/login` renders, and `docker compose exec app node --version` / `pnpm --version` report the `mise.toml` pins (24.21.0 / 12.4.2).
- [ ] The seeded credentials from `prisma/seed.ts` sign in at `/login`; their products become visible once T05/T08 render `/products`.
- [ ] `docker compose down` stops both services without touching the test-profile database used by `pnpm test:integration`.

### B. Authentication and session screens (F1, F5, F6 — T04's own screens)

- [ ] `/register` with a new email and a password of at least 8 characters shows "Account created. Sign in to continue." on `/login` and does not sign the visitor in.
- [ ] `/register` with a password shorter than 8 characters shows the message next to the password input, marks the input invalid and keeps the typed email.
- [ ] Registering an already used email shows the sanitized "Unable to register" alert; the form stays usable and the values remain.
- [ ] `/login` with a wrong password shows "Invalid email or password" without leaving `/login`, and the same message appears for an unknown email (no account enumeration).
- [ ] `/login` with valid credentials leaves the form and arrives at the app's redirect target, and `GET /api/auth/session` returns the signed-in user.
- [ ] While a sign-in is in flight the submit button is disabled and the form reports `aria-busy="true"`; a second click cannot submit.
- [ ] With the API unreachable (browser offline mode, or `docker compose stop app` after the form has loaded) the form reports a network failure and works again once the API is back.
- [ ] Visiting `/` while signed out redirects to `/login`; visiting `/login` or `/register` while signed in redirects into the app.
- [ ] After the dashboard shell renders (T08/T09) the sign-out control revokes before leaving the page; in the meantime the same revocation is exercised by the integration suite and by deleting the session row in the test database.
- [ ] An unknown route renders the "Page not found" state with a working "Go home" action instead of a blank page.

### C. Rows owned and extended by later tasks

- [ ] T08 adds: products list/search/pagination/empty state, create/edit/delete with confirmation, field errors, version-conflict refresh, and the same session checks on `/products*`.
- [ ] T09 adds: invoice creation with live totals equal to the saved totals, status filter, detail with snapshots, issue/paid/cancel transitions, and the same session checks on `/invoices*`.
- [ ] T10 records the completed checklist results per requirement ID, including the loading/error boundaries that no current screen can trigger — those stay "not exercisable", never "passed".

## Contract notes for successors

| Consumer | Contract |
|---|---|
| T08/T09 client code | `apiFetch<T>(url, init?)` from `@/lib/client-api`: same-origin credentials, `accept: application/json`, JSON content type for string bodies, `undefined` for 204, and `ApiClientError` (`status`, `message`, `body.error.fields`) for every failure; an unreachable server reports `status: 0` + `NETWORK_ERROR`; a 401 from a protected endpoint navigates to `/login`, while `/api/auth/login` and `/api/auth/register` deliberately keep their 401 inside the form. |
| T08/T09 lists | `Pagination({ pagination, basePath, query? })` from `@/components/pagination`: previous/next links, `?page=n` (omitted for page 1), filters preserved; renders nothing when `total === 0`. |
| T08/T09 UI kit | `components/ui/*`: button (variants + `asChild`), input, label, textarea, table (Table/Header/Body/Footer/Row/Head/Cell/Caption), card (Header/Title/Description/Action/Content/Footer), badge, alert (Alert/AlertTitle/AlertDescription, `role="alert"` by default and overridable), alert-dialog (Trigger/Portal/Overlay/Content/Header/Footer/Title/Description/Action/Cancel), skeleton. `components.json` targets Tailwind v4 with the existing `@/` alias; the shadcn CLI is not installed, so extend by hand using installed dependencies only. |
| T08/T09 pages | New pages belong in `app/(dashboard)/…`: the group layout already calls `requirePageUser()` and renders the navigation plus `LogoutButton`, and every page must still authorize its own data loads. |
| All | Next 16.3.5: error boundaries receive `{ error, retry }` (**`retry`, not `reset`**); `params`/`searchParams` are Promises; a signed-in visitor hitting `/login` or `/register` is redirected to `/products` by the `(auth)` layout; login redirects to `/products`, registration to `/login?registered=1`, and no return-URL parameter is ever honoured. |
| T10 | Root metadata uses `title.template` `"%s · StockFlow"` with per-page `title` exports; the README should note the system-font/Tailwind-v4 token setup (no Google fonts, offline-safe build) and that bare `pnpm test` still refuses a missing E2E suite — E2E is the documented bonus item and is now out of T04's scope. |

## Proposed coordinator updates (central files are read-only to workers)

1. **Graph:** drop/defer `tests/e2e/auth.spec.ts` from T04's ownership (user decision) and record that browser-level F1/F5/F6 evidence now belongs to the T08/T09 suites, or to a later dedicated task.
2. **Harness defect (resolved by revision 2):** the T00-owned `playwright.config.ts` ignored `**/.worktrees/**`, so `pnpm test:e2e` collected zero tests in every feature worktree. AMEND-T04-1 removed the Playwright layer instead of amending that ignore rule, because browser testing itself is out of scope; the graph and the dependency guide record the retirement so no later task re-adds a browser suite unknowingly.
3. **Deployability request — delivered by T04 (revision 2):** the authorized container work is complete and rehearsed from a fresh clone (see Validation). The graph now lists `Dockerfile`, `.dockerignore` and `docker/**` under T04's `owns`, with `docker-compose.yml` still owned by T00 and T04/T08/T09 recorded as authorized editors. No production-output change to `next.config.ts` was needed: the image runs `next start` against the regular build. Coordinator follow-ups: have T10 document the `clone → .env → docker compose up` workflow and the seeded demo credentials in the README, and decide whether the plain `3000:3000` mapping is sufficient for the eventual deployment.
4. **Environment note for that work:** this machine has no root/sudo, so image builds must not rely on host `apt`/`install-deps` steps; Docker itself requires `sg docker -c` in this session.

