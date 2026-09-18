# T10 — Swagger and release verification

Status: IN_PROGRESS — Swagger/documentation slice VERIFIED and handed off in REVIEW; release deliverables pending T09
Owner: T10 worker (Cline), dispatched by the user 2026-09-18
Depends on: T08 (accepted), T09 (in progress — see the early-start note)
Requirement IDs: N1, N2, N3, N4, N5, N6, N7
Branch / worktree / base SHA: `task/T10-release` in `<PRIMARY>/.worktrees/T10-release`, branched from verified `origin/main` `7bd5f6855d3f099eecb72afecd1403f03461af8f`
Accepted dependency revisions: T08 — accepted tip `10e1f2e`, tested merge `15d17a7` (ancestor of `origin/main`, verified by `git merge-base --is-ancestor`). T09 — not merged.

> **Early-start note (user direction, 2026-09-18).** The user dispatched T10 while T09 is still in
> progress, on the assessment that the invoices UI does not touch the API or this task's files. This
> branch therefore carries the Swagger/documentation slice only, built from verified `origin/main`
> (`7bd5f68`, which already contains accepted T08). T09 owns `app/(dashboard)/invoices/**`,
> `components/invoice-form.tsx`, `components/invoice-list.tsx`, `components/invoice-actions.tsx` and
> `components/product-picker.tsx`; none of them is touched here, so the two branches do not overlap.
> The T09-dependent work — the 36-ID ledger (`docs/requirements.md`), the fresh-worktree release
> rehearsal and the clean-clone container rehearsal — remains NOT_STARTED and must be completed on
> this task after T09 is accepted and merged. Nothing in this slice claims release readiness.
>
> The specification covers the API surface of accepted T00–T08 (11 paths, 15 operations) and cannot
> silently miss a T09 addition: `tests/unit/documentation.test.ts` walks `app/api/**/route.ts` and
> compares the exported HTTP methods with the documented operations, so any new invoice handler makes
> that test red until the specification is extended here.


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
| OpenAPI/Swagger and tests | VERIFIED | `lib/openapi.ts` (OpenAPI 3.1 document built from the handler Zod schemas), `app/api/openapi.json/route.ts`, `app/docs/page.tsx` + `components/swagger-viewer.tsx` (standalone, local `swagger-ui-dist`), `tests/unit/documentation.test.ts` (11 cases). Evidence below. | `381ec6ce4fbba95bd7dc0a4a92835a6ea8649f3e` |
| Complete README (including the `docker compose up` workflow) | IN_PROGRESS | `README.md` rewritten: container and local workflows, environment table, demo credentials from `prisma/seed.ts`, both documentation URLs, test commands and what the runner pins, behaviour rules, tech choices, scope cuts, one-more-week ideas, AI usage, troubleshooting. The release-time "actual hours" line and the T09-dependent screens remain outstanding. | `381ec6c` (same revision) |
| 36-ID ledger with checklist-based F1–F6 evidence | NOT_STARTED | `docs/requirements.md` does not exist yet: F3/F4 depend on T09's reviewer checklist rows. | None |
| Clean-clone and integrated release verification | NOT_STARTED | Needs T09 merged, the `postgres-test` lease and the container rehearsal. | None |

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

Deliberately not exercised here: rendering Swagger UI in a browser (no browser suite exists by
AMEND-T04-1, so this stays a reviewer-checklist item — "open <http://localhost:3000/docs> and confirm
the operations render and the spec loads"), the `postgres-test`-dependent integration suites and the
release/container rehearsals, all of which belong to the phase after T09 lands.


## Handoff

Completed (Swagger/documentation slice): `lib/openapi.ts` (OpenAPI 3.1 document generated from the
handler Zod schemas), `app/api/openapi.json/route.ts` (public, uncached, same-origin), `app/docs/page.tsx`
+ `components/swagger-viewer.tsx` (standalone Swagger UI from the locally installed `swagger-ui-dist`,
outside the `(dashboard)` shell, no session guard, no CDN, no client link), `README.md` (rewritten),
and `tests/unit/documentation.test.ts` (11 cases, new unit suite total 90/90).

Remaining: `docs/requirements.md` (the 36-ID ledger, with F1–F6 as reviewer-checklist results),
the fresh-worktree release rehearsal, the clean-clone `docker compose up` rehearsal and the README
"actual hours" line — all after T09 is accepted and merged, under the `postgres-test` lease.

Red/green commands/results: red `pnpm test unit` `1 failed | 8 passed` files / `9 failed | 81 passed`
tests; green `pnpm test unit` 90/90, `pnpm lint` 0, `pnpm typecheck` 0 (cache cleared first),
`pnpm build` 0 with `ƒ /api/openapi.json` and `○ /docs`, built-app HTTP checks 200/200/401/401 plus the
artifact and no-CDN checks, port 3200 released afterwards.

Implementation/tested SHA; integrated main SHA: tested revision
`381ec6ce4fbba95bd7dc0a4a92835a6ea8649f3e` (commits `736e186` red test suite → `d257f7b` spec, route,
page and viewer → `381ec6c` README). Integrated main SHA: none for this slice — it is not merged.
Branch base is `origin/main` `7bd5f68`; no main integration was needed because the branch already sits
on the current tip, and no main merge is authorized.

Uncommitted work: none; this card's commit is documentation-only on top of the tested revision.

Contract notes: Swagger surface = `GET /api/openapi.json` (machine-readable) and `/docs` (standalone
viewer, documented in the README only); session cookie names `better-auth.session_token` and
`__Secure-better-auth.session_token` are both documented in the security scheme; the specification
documents the flat `Page` envelope, the `DELETE`-with-JSON-body version guard, 422-on-malformed-path-id
versus 404-on-unknown/foreign id, integer-cent money, origin enforcement on mutations, and every error
code the request path can produce. Requirement gaps to record in the ledger: N5 has automated coverage
for spec/route/handler agreement plus one manual browser item; N1/N4 stay open until the rehearsals run.

Blockers: T09 is not accepted/merged, so the ledger and the release rehearsals cannot be completed
honestly yet; the `postgres-test` lease and the container rehearsal are also still to be requested for
that phase; the user-supplied "actual hours" figure is outstanding. Nothing in this slice is BLOCKED by
a conflict or a failure.

Push/PR status: pushed to `origin/task/T10-release` (this branch); no PR opened; main untouched.
Worktree: retained until the push is verified on `origin`, then removed without `--force` (`node_modules`,
`.next`, `generated/` are ignored, reproducible build artifacts; the temporary `next start` on port 3200
was stopped and both probes were deleted).

Proposed coordinator record (central files are read-only to this worker): record T10 as
IN_PROGRESS — Swagger/documentation slice in REVIEW at tested revision `381ec6c`, with T09 still the
gate for the release deliverables; T09 adds no API handler, so the specification's operation set is
expected to stay complete, but the documentation suite must be re-run on the post-T09 revision before
the ledger and the rehearsals are attempted.

Next action: coordinator review of the Swagger slice (spec against the handlers, the viewer separation
from the client, ownership and the README claims), then either acceptance or review rework; afterwards
this task resumes for the ledger and the release rehearsals once T09 is merged.
Coordinator acceptance / merge SHA: Pending.

