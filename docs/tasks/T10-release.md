# T10 — Swagger and release verification

Status: IN_PROGRESS — all deliverables complete and verified at the release revision; coordinator acceptance pending
Owner: T10 worker (Cline), dispatched by the user 2026-09-18
Depends on: T08 (accepted), T09 (accepted and merged)
Requirement IDs: N1, N2, N3, N4, N5, N6, N7
Branch / worktree / base SHA: `task/T10-release` in `<PRIMARY>/.worktrees/T10-release`; branched from `origin/main` `7bd5f68`, then main (with T09 accepted at `b22d2cb`) merged in as `93c34aa`
Accepted dependency revisions: T08 — accepted tip `10e1f2e`, tested merge `15d17a7`. T09 — accepted tip `b9c372c`, tested merge `b22d2cb` (both ancestors of `origin/main`, verified with `git merge-base --is-ancestor`); `origin/main` was `6f2af0e` when this branch integrated it.

> **Early start (superseded, kept for the record).** T10 began while T09 was still in progress, by
> explicit user direction, on the Swagger/documentation slice only. T09 has since been accepted
> (`b22d2cb`) and merged into this branch (`93c34aa`, no conflicts); the T09-dependent work — the
> 36-ID ledger, the fresh-clone rehearsal and the container rehearsal — is now complete below. T09
> added no API handler, so the specification still matches the shipped surface exactly
> (`tests/unit/documentation.test.ts` re-ran green on the merged revision).


> **Requirement amendment (user, 2026-09-18):** Playwright was removed from the application (decision record on T04's card), so this card no longer owns `tests/e2e/docs.spec.ts`, the release rehearsal installs no browser and no release step depends on a browser phase. Two duties were added instead: the README must document the container workflow that T04 introduced ("clone → populate env where necessary → `docker compose up`"), and the 36-ID ledger must record F1–F6 as reviewer-checklist results (including "not exercisable" items) instead of browser-test titles.

> **Scope amendment (user, 2026-09-18 — API documentation is delivered separately from the client application).** Decision from the user's T08 browser check-off: a client is not the maintainer of the API, so developer documentation must not appear in the client-facing application. Consequences for this task:
>
> - The OpenAPI 3.1 spec stays machine-readable and public at `GET /api/openapi.json`, still validated against the implemented handlers.
> - The human-readable Swagger surface must stay **outside the client app**: `app/docs/page.tsx` renders standalone, outside the `(dashboard)` shell, and no client-facing screen may link to it or advertise it. T08's rework already removed the shell's `API docs` navigation entry for exactly this reason, and it must not come back.
> - `app/docs/page.tsx` and `components/swagger-viewer.tsx` remain this task's owned files; they may be changed only to satisfy that separation (for example no dependency on dashboard-only components, no session-guard requirement borrowed from the shell, no entry in `app/(dashboard)/layout.tsx`).
> - The README documents the standalone docs URL (the plan's README line already requires a Swagger URL) and the 36-ID ledger's N5 row must state that the client UI exposes no developer documentation.

## Scope and ownership

Own T10 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read all task handoffs and plan Testing/Dependencies/release criteria. Audit all 36 requirement IDs, not only N IDs. Feature regressions pause for owner/coordinator rework; release task cannot freely edit every source file.

## Acceptance and test design

- Write spec/documentation tests first. OpenAPI 3.1 validates and matches implemented methods, inputs, cookie security/Origin, pagination, field errors and statuses. Local Swagger assets/spec work without external validator/CDN.
- README reflects actual scripts/env/migrations/seed/tests/shared process, safe demo credentials, choices/trade-offs, one-more-week, honest AI usage and user-supplied hours. No invented time or unsupported claims.
- Create docs/requirements.md with each A1–A9/I1–I4/V1–V10/F1–F6/N1–N7, responsible task, actual test/title, result/revision and unresolved gap. Text presence alone is not operational proof.
- Fresh disposable worktree rehearses frozen install, env/secret generation, PostgreSQL migration, seed twice/demo login, `pnpm test` (unit + integration; no browser phase exists), lint/typecheck/build/start and manual smoke. A second rehearsal clones the repository and runs `docker compose up` after populating `.env`, then reads the app at `http://localhost:3000`. No undocumented setup, secret tracking or destructive dev reset.
- Review meaningful incremental history, never fabricate/backdate commits. Single-command test failures propagate. The docs page rendering is verified by the reviewer checklist and the OpenAPI spec test, since no browser suite exists.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| OpenAPI/Swagger and tests | VERIFIED | `lib/openapi.ts` (OpenAPI 3.1 document built from the handler Zod schemas), `app/api/openapi.json/route.ts`, `app/docs/page.tsx` + `components/swagger-viewer.tsx` (standalone, local `swagger-ui-dist`), `tests/unit/documentation.test.ts` (11 cases) | `381ec6c`, re-verified on main-integrated `93c34aa` |
| `tech_spec.md` (requirement → implementation → tests) and the discrepancy log | VERIFIED | `tech_spec.md`: 36 requirement rows plus the cross-cutting money/bonus/scope rows, built by independent discovery from `project.md` + code + tests and then cross-checked against the plan, graph and cards; `docs/discrepancies.md`: D1–D11 with severity, disposition and the "checked and consistent" list | `a28fe3c` |
| Complete README (including the `docker compose up` workflow) | IN_PROGRESS — **left to the author by user decision** | `README.md` carries the container and local workflows, environment table, demo credentials from `prisma/seed.ts`, both documentation URLs, test commands and what the runner pins, behaviour rules, tech choices, scope cuts, one-more-week ideas, AI usage and troubleshooting. The user reserved the final pass (hour count, bonus claims, endpoint table) for the human author, so no hours are claimed here | `381ec6c` |
| 36-ID ledger with checklist-based F1–F6 evidence | VERIFIED | `docs/requirements.md`: all 36 IDs with responsible task, the actual suite/file/test title or checklist rows, result at the tested revision, and the unresolved gaps (F6 boundaries "not exercisable"; the README hour line) | `a28fe3c` |
| Clean-clone and integrated release verification | VERIFIED | Rehearsal A (fresh clone, documented local workflow — found defect D11), rehearsal B (the same workflow after the fix: seed twice, `pnpm dev`, demo login, session, products), rehearsal C (`docker compose up --build` from a fresh clone, app used at `http://localhost:3000`), plus `pnpm test` 90/90 + 136/136 and lint/typecheck/build 0 on the main-integrated revision. Full command log in the Validation section | `a28fe3c` |
| Defect found and fixed during release | VERIFIED | D11: a fresh clone could not seed or start (`MODULE_NOT_FOUND` / HTTP 500). Fixed in `a28fe3c` (`dev`, `db:migrate`, `db:seed` generate the client first) and pinned by harness test `T00-H27`; recorded in `docs/discrepancies.md` D11 and proposed for the graph's `post_acceptance_fixes` | `469f7eb` (red test) + `a28fe3c` (fix) |


## Validation

Swagger slice, run in `<PRIMARY>/.worktrees/T10-release` on `381ec6c` (this repository's own gates;
no database lease was taken, because T09 is concurrently using the shared resources and this slice
changes no request path):

| Command | Result |
|---|---|
| `pnpm test unit` | 90/90 passed, 9 files (was 79/79 before this task; `documentation.test.ts` adds 11) |
| `pnpm lint` | exit 0, no warnings |
| `pnpm typecheck` (`prisma generate && next typegen && tsc --noEmit`, run with `tsconfig.tsbuildinfo` deleted to defeat incremental caching) | exit 0 |
| `pnpm build` | exit 0; route table lists `ƒ /api/openapi.json` and `○ /docs` beside the five API families |
| Red step (TDD) | `pnpm test unit` with the new suite and no README: `1 failed | 8 passed` files, `9 failed | 81 passed` tests — the spec was validated but the README, the code-scan and the viewer checks were red |
| Built-app HTTP check (`pnpm start --port 3200`, primary dev server on 3000 untouched, port verified free before and released after) | `GET /api/openapi.json` → 200 `application/json` 44,753 bytes `cache-control: no-store`, parsed as `openapi 3.1.0`, 11 paths, 21 schemas, 8 shared responses; `GET /docs` → 200 HTML with `id="swagger-ui"` and only `/_next/static/...` asset URLs (no CDN); `GET /api/products` → 401 and `GET /api/auth/session` → 401 without a session |
| Artifact check | the `/docs` page loads a 1.42 MB local chunk containing the vendored `swagger-ui-dist` bundle plus a 184 KB local CSS chunk; the prerendered `docs.html` references no external host |

What the documentation suite pins (all green): the document validates as OpenAPI 3.1 with the local
`@apidevtools/swagger-parser` and contains no external `$ref`; the documented operation set equals the
exported HTTP methods of every `app/api/**/route.ts` (15 operations over 11 paths); every request body
and query parameter is byte-comparable to the JSON Schema Zod derives from the handler's schema;
every operation's documented statuses and per-status error-code enums match the reviewed table
(including `INVALID_JSON`, `ORIGIN_REJECTED`, `VERSION_CONFLICT`, `INSUFFICIENT_STOCK`,
`STOCK_OVERFLOW`, `INVOICE_NOT_EDITABLE`, `TRANSACTION_CONFLICT`, `REGISTRATION_FAILED`,
`INVALID_CREDENTIALS`, `RATE_LIMITED`); every `new AppError(<status>, "<CODE>")` in `lib/` and
`app/api/` is documented at that status and the document contains no code the implementation cannot
produce (with `INVALID_MONEY` excluded and explained: `parseMoney` is a client-form helper and the API
takes integer cents, while a 5xx `AppError` is always sanitized to `INTERNAL_ERROR`); the session
cookie scheme is required exactly on the twelve protected operations and absent on
`register`/`login`/`GET /api/openapi.json`; `lib/openapi.ts` is imported by the route handler and the
standalone page only; and no client screen contains a `/docs` link or the word `openapi`.

## Release verification (after main with T09 was integrated into this branch)

All commands below ran in `<PRIMARY>/.worktrees/T10-release` on the main-integrated revision
`93c34aa` and the tested release revision `a28fe3c` (the last executable change; every later commit on
this branch is documentation). The `postgres-test` lease was free (T09 concluded) and was used here;
the coordinator's shared dev Compose project and port 3000 were left untouched while the container
rehearsal ran under its own Compose project with the bundled postgres published on host port 5442.

| Step | Result |
|---|---|
| `pnpm test` (unit + integration, real PostgreSQL under the lease) | unit 90/90 (9 files), integration 136/136 (6 files) — 226 tests |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | 0 / 0 / 0; the route table lists `ƒ /api/openapi.json` and `○ /docs` beside the five API families |
| Rehearsal A — fresh clone of the branch, no `node_modules`/`.next`/`generated`/`.env`, then the README's local workflow | `install --frozen-lockfile` 0, `db:migrate` 0, **`db:seed` exit 1 (`Cannot find module '@/generated/prisma/client'`)** and **`pnpm dev` HTTP 500 on `/login` (`Module not found: '@/generated/prisma/client'`)** — release-blocking defect D11; `pnpm test` 90/90 + 136/136, lint/typecheck/build 0, `pnpm start` smoke 200 |
| Rehearsal B — second fresh clone, same workflow after the fix | `install` 0, `db:migrate` 0, `db:seed` 0 twice ("the seed command has been executed"), `pnpm dev`: `/login` 200, `/register` 200, `/docs` 200, `/api/openapi.json` 200, `/products` 307 → `/login`, demo login 200 + session 200 + seeded `DEMO-005` row returned, `/products` page 200 with the cookie |
| Rehearsal C — fresh clone → `cp .env.example .env` + generated secret → `docker compose up --build` | image builds on the `mise.toml` pins, the entrypoint migrates, seeds and serves, and the running app answers at `http://localhost:3000` (evidence in the rehearsal log; the rehearsal's own Compose project is torn down afterwards) |
| N7 git-history check | 118 commits, 17 accepted `--no-ff` merges, one branch per task with red/green commits inside each, rooted at "Initialize Repo" — no squashed or fabricated history |
| `docs/requirements.md` | all 36 IDs recorded with task, actual test/evidence, result and gaps |

Deliberately not exercised, and therefore not claimed: rendering Swagger UI in a browser (no browser
suite exists by AMEND-T04-1 — the row stays on the reviewer checklist: open
`http://localhost:3000/docs` and confirm the operations render and the spec loads), the loading/error
*boundaries* (no screen throws on purpose, so they stay "not exercisable" per T04 row C3 / T09 row D5),
and the README's final human pass (hour count and bonus claims, reserved for the author).



## Handoff

Completed: the whole task at tested revision `a28fe3c` on main-integrated `93c34aa` —
`lib/openapi.ts` (OpenAPI 3.1 document generated from the handler Zod schemas),
`app/api/openapi.json/route.ts` (public, uncached, same-origin), `app/docs/page.tsx` +
`components/swagger-viewer.tsx` (standalone Swagger UI from the locally installed `swagger-ui-dist`,
outside the `(dashboard)` shell, no session guard, no CDN, no client link),
`tests/unit/documentation.test.ts` (11 cases), `tech_spec.md` (36 requirement rows + cross-cutting
rows, discovery-then-cross-check method documented), `docs/discrepancies.md` (D1–D11),
`docs/requirements.md` (the 36-ID ledger with per-task evidence and gaps), the marked submission
checklist in `project.md`, the always-green client generation fix for `dev`/`db:migrate`/`db:seed`
with harness test `T00-H27`, and the release rehearsals A/B/C.

Remaining (deliberately): the README's final pass — the hour count (`project.md` §9.2) and the
optional endpoint table — is reserved for the human author by user decision, so nothing here claims
those hours. The loading/error *boundaries* stay "not exercisable" in the ledger, because no screen
throws on purpose.

Red/green commands/results: red `pnpm test unit` `1 failed | 8 passed` files / `9 failed | 81 passed`
tests; green `pnpm test` 90/90 + 136/136, `pnpm lint` 0, `pnpm typecheck` 0 (cache cleared first),
`pnpm build` 0 with `ƒ /api/openapi.json` and `○ /docs`; harness red `1 failed | 25 passed` → green
`26 passed` for D11; rehearsals A (found D11) and B (fixed workflow: seed twice, `pnpm dev`, demo
login, session, products) and C (container) as recorded in the Validation section.

Implementation/tested SHA; integrated main SHA: tested revision
`a28fe3c` (D11 red test `469f7eb` → fix `a28fe3c`; Swagger slice `736e186`→`d257f7b`→`381ec6c`; the
main integration merge is `93c34aa`). Every commit after `a28fe3c` on this branch is documentation
only, so the merged content will be the tested revision.

Uncommitted work: none; the remaining commits on this branch are documentation.

Contract notes: Swagger surface = `GET /api/openapi.json` (machine-readable) and `/docs` (standalone
viewer, documented in the README only); session cookie names `better-auth.session_token` and
`__Secure-better-auth.session_token` are both documented in the security scheme; the specification
documents the flat `Page` envelope, the `DELETE`-with-JSON-body version guard, 422-on-malformed-path-id
versus 404-on-unknown/foreign id, integer-cent money, origin enforcement on mutations, and every error
code the request path can produce. Release-level notes for the author: the local workflow now
self-generates the Prisma client in every documented command (D11); the invoice-number deviation and
the production-only rate-limit caveat are D1/D2 in `docs/discrepancies.md`.

Blockers: none. Nothing was BLOCKED by a conflict, failure or unavailable resource; the `postgres-test`
lease was free and used, the container rehearsal ran under its own Compose project, and the author's
README pass is a deliberate hand-off rather than a blocker.

Push/PR status: `origin/task/T10-release` carries the slice and the release work; no PR opened; main
untouched by this worker. Coordinator acceptance is performed by the same session in the coordinator
role and recorded below.

Proposed central records (central files are read-only to the worker role): `acceptance_records.T10`
with the approved tip and tested merge SHA; a `post_acceptance_fixes`-style entry for D11
(`package.json`, `tests/unit/test-harness.test.ts`, red `469f7eb`, fix `a28fe3c`) since it touches
T00-owned paths; memory-bank updates naming T10 as the last remaining task and the README's reserved
human pass.

Next action: coordinator merge of this branch into `main`, verification on the merged revision,
`origin/main` push, and the central documentation/memory-bank update marking T10 DONE. The only work
left after that is the human README pass.


