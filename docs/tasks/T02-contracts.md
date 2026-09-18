# T02 — Shared contracts and pure helpers

Status: REVIEW
Owner: Cline; exclusive T002 -> T02 user dispatch (implementation, commits and task-branch push authorized; no main merge). No DB/port leases needed.
Depends on: T00
Requirement IDs: A8, I3, V2, V3, N6
Branch / worktree / base SHA: task/T02-contracts / /home/areion/projects/eterna-take-home/.worktrees/T02-contracts / 237b01b74e0c2bda135d84850c7a4ffc87799068; integrated origin/main ae1becc55350ea4793e894320b40269f41d23df4 via merge 636ef7384a21b0a6e3ea7ad4bf8d64a5c7ad7bc9
Accepted dependency revisions: T00 approved tip 7d880636bd1a045f3ff8eb4d01b893a8a91bb34c with coordinator-tested merge 997874c5325a53c26d68658ce1bfb3a1f466282e. T01 approved tip a19d7c8edbe260a7086e101bd34f06e6d2f9452c with coordinator-tested merge b801d3ae93e7cbca1e4f659bd17e375609fcf7de; the user-approved post-acceptance harness fix is merged at ae1becc55350ea4793e894320b40269f41d23df4. All verified ancestors of fetched origin/main with `git merge-base --is-ancestor`; retained task-branch tips match the approvals. Central acceptance graph/memory record supersedes historical Pending card text.

## Scope and ownership

Own T02 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan: Types, Functions, security/money decisions. No generated Prisma imports, auth implementation or database helper; runs alongside T01.

## Acceptance and test design

- Define strict complete input schemas and public DTOs, including versions, status union, pagination, dates and field paths. Reject extra ownership/prices/totals fields and duplicate lines.
- Write unit tests before exact decimal-string-to-cents parsing, half-up basis-point tax and bounds; exercise multibyte passwords/date validity/unsafe pagination.
- Server env validates required secrets/URLs/tax, rejects placeholders; omission tax = 1100. No public secret exports.
- Consistent AppError/JSON/origin mapping; all Set-Cookie headers preserved individually by response forwarding. Test sanitized 500 and recognized transaction-exhaustion error -> 409 without importing T01 modules.
- Pure helpers import independently of DB/server environment. Stable contracts must support all planned routes; unresolved schema/API ambiguity blocks T03 join.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Complete schemas and DTO contracts | VERIFIED | lib/types.ts, lib/validation/schemas.ts; 8 validation tests (strict inputs, snapshots/duplicates, dates, pagination, Unicode credentials); typecheck | 7efc91e91d1dc1fe4f66e5c663e3c84209f9140b |
| Exact money and validated server env | VERIFIED | lib/money.ts, lib/env.ts; 19 money + 3 env tests (exact cents/half-up/overflow; required configuration and defaults) | 7efc91e91d1dc1fe4f66e5c663e3c84209f9140b |
| HTTP/error/origin/cookie helpers and tests | VERIFIED | lib/http.ts; 6 HTTP tests (JSON/Zod/AppError, sanitized 500, P2034 409, exact Origin, public user projection and separate cookies) | 7efc91e91d1dc1fe4f66e5c663e3c84209f9140b |

## Validation

Run owned unit tests without Docker, then existing unit regressions/lint/typecheck/build as available. Record any DB-dependent deferred checks, not mock claims of integration correctness. T03 verifies actual BetterAuth forwarding and schema compatibility.

Dependency-integration revalidation (2026-09-18, second pass): once T01's merge b801d3a and the harness fix merge ae1becc were on origin/main, I recreated the isolated worktree on the retained branch `task/T02-contracts`, installed with `pnpm install --frozen-lockfile` (exit 0, lockfile unchanged by main — only package.json scripts changed), and integrated `origin/main` ae1becc using `git pull --no-rebase --no-edit origin main` → clean merge commit 636ef73, zero conflicts (T02-owned paths and main's paths are disjoint). Re-ran every gate in that worktree at 636ef73: unit 67/67 across 7 files (T02's 36 + main's 31 = harness 23, transaction 6, environment-example 2), `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0, all without a manual `pnpm db:generate` because the merged harness fix now generates the client inside the unit/typecheck/build scripts. T02 file content at 636ef73 is byte-identical to the implementation revision 7efc91e (no overlap with main's diff).
Deferred (explicitly not passed): Docker/PostgreSQL integration checks — the T01-owned integration suite requires the shared test database and a coordinator lease, none was granted to T02, T02 changes no Prisma/DB file, and that suite already passed 25/25 at T01's merge and at the harness-fix merge.

## Handoff

Completed: All three deliverables (see table). Remaining: successor phases (T03 auth integration; T10 documentation audit).
Red/green commands and results: red = missing-module import failures for @/lib/money and @/lib/validation/schemas; first behavioral red = oversized quantity accepted when unitPrice was 0 → implementation made the quantity bound explicit; direct ZodError mapping added after 500-vs-422 mismatch; SKU normalization reordered after transform-order failure. Green = 58/58 tests across 6 files, lint 0, typecheck 0, build 0, all at 7efc91e91d1dc1fe4f66e5c663e3c84209f9140b after origin/main pull --ff-only (no-op; main 237b01b unchanged).
Implementation SHA: 7efc91e91d1dc1fe4f66e5c663e3c84209f9140b. Integrated/revalidated revision: merge 636ef7384a21b0a6e3ea7ad4bf8d64a5c7ad7bc9 over origin/main ae1becc55350ea4793e894320b40269f41d23df4 (T02 files identical to 7efc91e); this docs-only commit adds evidence and changes no executable file.
Uncommitted work: none at handoff; all evidence committed with card.
Contract notes for successors (T03 first): registerSchema/loginSchema (Zod 4 strictObject; email trim+lowercase ≤254, password ≤72 UTF-8 bytes, ≥8 code points register-only, no trim) feed lib/auth/password.ts unchanged; readJson throws AppError(400 INVALID_JSON) for bad JSON/media type, AppError(422 VALIDATION_ERROR) with indexed field paths (items.0.quantity, root key _root) for schema failures; direct ZodError in handleRoute also maps to 422. errorResponse: AppError 4xx passthrough, anything else (including thrown 5xx AppError) sanitized 500; structural PrismaClientKnownRequestError+P2034+clientVersion → 409 TRANSACTION_CONFLICT (no Prisma import; T01 retry exhaustion rethrow satisfies it). assertSameOrigin compares request Origin header exactly to env BETTER_AUTH_URL (unstable across route helpers: reads process.env.BETTER_AUTH_URL; T03 may centralize with lib/env). forwardAuthResponse(login|register|logout): preserves every Set-Cookie header separately via getSetCookie, projects {user:{id,email,name}} to dataResponse 200/201, logout → 204, 400/401/404 → 401 INVALID_CREDENTIALS, 422 → 409 (register), 403/429 passthrough, malformed success → 500. lib/money parseMoney exact digit-by-digit cents (0..2147483647, no parseFloat), formatMoney $x,xxx.xx, calculateTotals half-up once on subtotal with subtotal×rate numerator safe-integer check; throws AppError(422 ARITHMETIC_BOUNDS) — importable by lib/services (T05–T07) without Prisma/env imports. readEnv (server-only) returns {databaseUrl,authUrl,authSecret,nodeEnv,taxRateBps} with omitted TAX_RATE_BPS=1100; rejects placeholders, malformed URLs, tax outside 0..10000; never discloses values. lib/types exports SessionUser, Page<T>, ApiErrorBody, ProductDto, InvoiceSummaryDto, InvoiceDetailDto, InvoiceItemDto, MoneyTotals, InvoiceStatus, and re-exports all *Input types. emptyBodySchema available for logout 204. UUIDs lowercase; calendarDateSchema validates real dates without timezone conversion.
Blockers: none.
Push/PR status: task/T02-contracts pushed again after the dependency integration (see chat for the pushed SHA); main untouched by T02.
Next action: Coordinator review/acceptance/merge of this tip (already based on the accepted T01/harness main); T03 stays blocked until T02 is accepted and published, and then only on a separate DONE dispatch.
Coordinator acceptance / merge SHA: Pending.
