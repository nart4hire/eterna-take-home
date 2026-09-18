# T04 — UI foundation and authentication screens

Status: REVIEW
Owner: T04 worker (chat dispatch "Let's implement T04" → implementation, commits and task-branch push authorized; main merge NOT authorized)
Depends on: T03
Requirement IDs: F1, F5, F6
Branch / worktree / base SHA: `task/T04-ui-foundation` / `/home/areion/projects/eterna-take-home-2/.worktrees/T04-ui-foundation` / `14e8b7134cadeb9f348b35fb361d70575f374b29` (= fetched `origin/main` at creation)
Accepted dependency revisions: T03 approved task tip `bcad7789fead68f035d478815efce380b012f036` (tested merge `3e38219630b8d4ff7f1ef151eec85c87820dabd8`); both verified as ancestors of fetched `origin/main` `14e8b71` with `git merge-base --is-ancestor` (exit 0) before the branch was created. T01/T02 arrive through T03's reviewed tip.

> **Scope decision (user, 2026-09-18, during this task): the Playwright browser suite is dropped.** `project.md` §6 lists E2E as a bonus item, and the user keeps only the bonus items they will handle later (`docker-compose up` bringing up app + database, and a deployment). `tests/e2e/auth.spec.ts` was written, run once against a real dev server on port 3100, then removed together with the temporary worktree-only Playwright config; no E2E deliverable and no browser-coverage claim remains in this task. The graph still lists `tests/e2e/auth.spec.ts` under T04's ownership — dropping it is a coordinator-owned graph edit (proposal below).

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

## Validation

- **Red (first):** `pnpm test:unit` → `Error: Cannot find package '@/lib/client-api' imported from .../tests/unit/client-api.test.ts`, exit 1 (missing module, not a configuration failure).
- **Green at the tested revision (`c3ae38b131986c974926408765a36eca931f0968`):** `pnpm lint` 0 (no warnings); `pnpm typecheck` 0 (`prisma generate && next typegen && tsc --noEmit`); `pnpm test:unit` 77/77 in 8 files (+10 new); `pnpm test:integration` 56/56 against real PostgreSQL (T01 25 + T03 auth 27 + seed 4, unchanged); `pnpm build` 0 with `/` dynamic, `/_not-found` static, `/login` and `/register` dynamic, and the four auth routes.
- **Leases:** only one worktree/branch existed and no competing test process was running; the shared `stockflow-postgres-test-1` service (127.0.0.1:5433) was already healthy and was never torn down. Docker needs `sg docker -c` in this session. This card is the lease request/record, as in T03.
- **Playwright (attempted, then removed by user decision):** `pnpm test:e2e` collected zero tests because the committed `playwright.config.ts` (T00-owned) sets `testIgnore: ["**/.worktrees/**"]`, which matches every feature-worktree path — reproduced with `pnpm exec playwright test --list` → `Total: 0 tests in 0 files`; an explicit file argument does not bypass it. The browser binary also lacked system libraries (`libnspr4`, `libnss3`, `libasound2`) and this environment has no root/sudo, so `playwright install-deps` cannot run. The single exploratory run therefore used a temporary untracked worktree-only config plus libraries extracted from `.deb` packages into `~/.local/share/stockflow-playwright-deps` with `LD_LIBRARY_PATH`, and reached browser launch. That config, the spec, `test-results/` and `playwright-report/` were all deleted; the retained `~/.local/share/stockflow-playwright-deps` prefix is outside the repository and harmless if unused.
- **Deferred, not claimed green:** browser-level F1/F5/F6 coverage (removed by user decision; T08/T09 own `tests/e2e/products.spec.ts` and `invoices.spec.ts`), a real throw through the loading/error boundaries (no page in this task can fail on purpose), and the user-owned bonus items (`docker-compose up` for app + database, deployment).

## Handoff

Completed: UI foundation (shadcn-style components, tokens, system fonts, metadata), client API helper and shared pagination, auth screens, logout, session guards, and error/loading/not-found boundaries; 10 new unit tests; lint/typecheck/build plus the integration regression suite.
Remaining: browser-level F1/F5/F6 assertions (deferred by user decision), protected product/invoice pages (T08/T09), README/Swagger (T10), coordinator review, acceptance and merge.
Red/green commands and results: see Validation.
Implementation/tested SHA: `c3ae38b131986c974926408765a36eca931f0968` (tests, foundation, auth UI); this card is a documentation commit on top of it.
Integrated main SHA: `14e8b7134cadeb9f348b35fb361d70575f374b29` (branch base, re-verified before push).
Uncommitted work: none (clean working tree; only git-ignored `.next/`, `generated/`, `node_modules/` and `tsconfig.tsbuildinfo` remain).
Contract notes: table below.
Blockers: none. Limitations: no browser/E2E evidence by user decision; the error/loading boundaries are wired but their throw paths are unexercised; `Pagination` needs a real list page (T08/T09).
Push/PR status: `task/T04-ui-foundation` pushed to `origin`; `main` untouched.
Next action: coordinator reviews the diff/evidence, then merges the branch tip with `--no-ff` and re-verifies; T08 also needs T05, T09 also needs T07.
Coordinator acceptance / merge SHA: Pending.

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
2. **Harness defect (T00-owned `playwright.config.ts`):** `testIgnore: ["**/.worktrees/**"]` makes `pnpm test:e2e` collect zero tests in every feature worktree, so any future browser-suite task needs that ignore rule amended — or a worktree-safe config — before it can produce evidence.
3. **Deployability request (user, this task):** "the app fully deployable with 1 docker compose file (Next.js + Postgres)" touches `docker-compose.yml` (T00-owned) and needs a new `Dockerfile` plus a production `next.config` decision; none of those paths are T04-owned, so nothing was changed here. Request: assign an owner/card (T00 amendment or T10 release work) before a worker edits them.
4. **Environment note for that work:** this machine has no root/sudo, so image builds must not rely on host `apt`/`install-deps` steps; Docker itself requires `sg docker -c` in this session.

