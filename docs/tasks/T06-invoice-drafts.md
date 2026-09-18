# T06 — Invoice drafts API

Status: REVIEW (coordinator review complete; acceptance and main merge pending user approval)
Owner: T06 worker (`task/T06-invoice-drafts`); round-3 review fix committed by the coordinator
Depends on: T05 (accepted and merged)
Requirement IDs: V1, V2, V3, V4, V5, V9, V10, A6, A7, N6
Branch / worktree / base SHA: `task/T06-invoice-drafts` / `<PRIMARY>/.worktrees/T06-invoice-drafts` (PRIMARY `/home/areion/projects/eterna-take-home`) / base `6002599` = the `origin/main` at dispatch
Accepted dependency revisions: T05 tip `d5eeaf3` (tested implementation `51ff472`, tested merge `6d05f4c`) — verified ancestor of `origin/main` `6002599` with `git merge-base --is-ancestor` before branching; T01 `a19d7c8`/`b801d3a`, T02 `fc14c2b`/`3f6a1d1` and T03 `bcad778`/`3e38219` are ancestors through T05's merge. `origin/main` did not advance during the first verification round; T04 was then accepted and merged, so main is now `f8f2763` and this branch has been integrated with it and re-verified (see the post-merge section below).

## Dependency cross-check: T04 (Playwright removal, container work)

T04 (`task/T04-ui-foundation`) carries **AMEND-T04-1**: Playwright and the entire browser layer are removed (`playwright.config.ts`, `@playwright/test`, `test:e2e`, the runner's `e2e` subset, the `next-e2e` lease, every `tests/e2e/**` file), the T04/T08/T09/T10 cards are amended to a manual reviewer checklist, and T04 adds `Dockerfile`/`.dockerignore`/`docker/**` plus a compose `app` service. Cross-check result at base `6002599`: **T04 does not block T06**. (Status update: at dispatch T04 was unreviewed; it has since been accepted — graph `acceptance_records.T04`, approved tip `e22cefc`, tested merge `e30b194` — and merged into main `f8f2763`, which is the revision this branch is now integrated with.)

- No path overlap: T04 changes UI/styles/client-helper files, dev/container files, T00-owned harness paths and central documents. T06 owns `lib/services/invoices.ts`, `app/api/invoices/**` and `tests/integration/invoices.test.ts`. T04 does not touch the T06 card or T06's graph entry, so neither merge order can produce a conflict on my owned paths.
- No requirement interaction: T06's IDs (V1–V5, V9, V10, A6, A7, N6) contain no UI (`F*`) or browser/harness IDs, and this card never referenced browser tests. Removing Playwright deletes no T06 coverage obligation.
- Harness compatibility: T06 uses `pnpm test unit` / `pnpm test integration` only. T04's `scripts/test.ts` edit changes the `e2e` subset branch and the suite suffix rule only; the unit fast path, the `postgres-test` Compose profile, `db:generate`, `db:migrate`, the destructive reset and the vitest invocation are unchanged, so this suite behaves identically before and after T04 lands.
- Container work is additive: T04 keeps the `postgres-test` profile on `127.0.0.1:5433/stockflow_test` and adds an `app` service, leaving the T06 lease target untouched.
- Unrelated observation, no action taken: T04's branch edits coordinator-owned documents (`docs/execution/dependency-graph.json`, `implementation_plan.md`, `.clinerules/memory-bank/*`, `.cline/skills/**`) and the T08/T09/T10 cards. This worker left every central document untouched and proposes the T06 graph/dashboard update in the handoff instead.

## Scope and ownership

Own T06 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Plan: invoice snapshots/money/drafts, Types, Functions. No status route, UI or product service changes. T07 may modify invoice service only after this task merges.

## Acceptance and test design

- Test valid multi-line draft; reject empty/duplicate/unknown/foreign/deleted references, excess stock, invalid dates and spoofed totals/price/ownership.
- Calculate exact bounded totals and snapshot current name/price/tax. Draft replacement retains existing-line snapshots; new lines get current product data; does not reserve stock. Snapshot survival after product edits tested.
- UUID-derived unique invoice number and valid dates; pagination/status filter/detail include expected data and stable owner scope.
- Draft-only versioned editing, atomic replacement and rollback on invalid line. Non-draft fixtures created via Prisma for rejection tests; status endpoint is T07, not a placeholder here.
- Parameterized auth/ownership/error tests in owned invoice test file cover each implemented method.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Create/list/detail/draft-item services and routes | VERIFIED | `lib/services/invoices.ts` (`listInvoices`/`getInvoice`/`createInvoice`/`replaceInvoiceItems`/`generateInvoiceNumber` + private `snapshotItems`/`loadOwnedProducts`), `app/api/invoices/route.ts` (GET/POST), `app/api/invoices/[id]/route.ts` (GET), `app/api/invoices/[id]/items/route.ts` (PUT); build route table `ƒ /api/invoices`, `ƒ /api/invoices/[id]`, `ƒ /api/invoices/[id]/items` | `09dffee` |
| Exact totals/snapshots/stock guard/version handling | VERIFIED | Snapshot lines carry `productName`/`unitPrice` from the product (or the retained invoice line), totals via `calculateTotals` with the invoice's stored `taxRateBps`, drafts never touch `quantityOnHand`, stock re-checked on every create/replace, version-guarded conditional update, whole-set replacement inside one `withSerializableRetry` transaction | `09dffee` |
| PostgreSQL draft/ownership/snapshot tests | VERIFIED | `tests/integration/invoices.test.ts` 28 cases (A6, A6/N6, A7/N6, V1 ×3, V2 ×4, V3 ×2, V4 ×2, V5 ×2, V9 ×5, V10 ×4, N6) against real PostgreSQL, real BetterAuth sessions and the exported route handlers; whole suite `pnpm test integration` 109/109 (5 files) | `09dffee` |
| Review pins + environment-independent suite (coordinator fix commit) | VERIFIED | `tests/integration/invoices.test.ts` 30 cases — unknown-id and foreign-product replacement 404s, empty replacement set, status filter with pagination, `updatedAt` refresh/no-touch; the `withTaxRate` restore no longer stores the string `"undefined"` and the file pins its own documented 11% baseline instead of inheriting a local `.env` | `898c219` |

## Validation

Lease: `postgres-test` only (`127.0.0.1:5433/stockflow_test`), used for T06 as dispatched. The pre-existing `stockflow-postgres-test-1` container was up and healthy and was reused/left running; Docker is reachable only through `sg docker -c` in this session, so every DB command was wrapped that way. No other worktree, agent process or lease was touched (the T04 worktree had already been removed and no vitest/next process was running).

Red then green, all commands executed in the worktree:
- Red at `e738746` (suite + 501 red-stage handlers): `sg docker -c 'pnpm test integration'` → exit 1, `Test Files 1 failed | 4 passed (5)`, `Tests 27 failed | 81 passed (108)`; every failure is a behavioral assertion (`expected 501 to be 401/403/404/409/422/500`), not an import or config error, and T01 (25), auth (27), seed (4) and products (25) stayed green.
- Green at `09dffee`: `sg docker -c 'pnpm test integration'` → exit 0, `Test Files 5 passed (5)`, `Tests 109 passed (109)` with `tests/integration/invoices.test.ts (28 tests)`.
- `pnpm test unit` → exit 0, 7 files, `Tests 67 passed (67)` (no T00/T02 regression).
- `pnpm lint` → exit 0; `pnpm typecheck` → exit 0 (self-generates the Prisma client); `pnpm build` → exit 0 with the three invoice routes listed above.
- Main integration: `git pull --no-rebase --no-edit origin main` → "Already up to date." (`origin/main` is still `6002599`), so `09dffee` is also the latest-main revision and no revalidation rework was needed.

Behavior proven by execution, not by reading code: stock is byte-identical after successful and failed draft operations; two concurrent same-version replacements produce exactly one 200 and one 409; an invalid second line leaves the original item row, version and totals untouched; a deleted product's snapshot stays readable while re-selecting it is 404.

### Post-merge re-verification (round 2, after T04's accepted main)

While this card was in REVIEW, T04 was accepted and merged (`f8f2763`, approved tip `e22cefc`, tested merge `e30b194`), so `origin/main` advanced past this branch's `6002599` base. Per the workflow the branch was integrated with the new main (`git pull --no-rebase --no-edit origin main`) at merge commit `57d28f8` — **no conflicts**, which matches the cross-check prediction — and then fully re-verified:

| Gate | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 with T04's lockfile (no `@playwright/test` in `node_modules`) |
| Integration | `sg docker -c 'pnpm test integration'` | exit 0 — 5 files, `Tests 109 passed (109)`, `invoices.test.ts (28 tests)` |
| Unit | `pnpm test unit` | exit 0 — 8 files, `Tests 78 passed (78)` (T04's `client-api.test.ts` + harness growth included) |
| Lint / typecheck / build | `pnpm lint`, `pnpm typecheck`, `pnpm build` | exit 0 / 0 / 0, route table still lists `ƒ /api/invoices`, `ƒ /api/invoices/[id]`, `ƒ /api/invoices/[id]/items` |

The T06 code paths at `57d28f8` are byte-identical to `09dffee` (`git diff --name-only 09dffee 57d28f8 -- lib/services/invoices.ts app/api/invoices tests/integration/invoices.test.ts` is empty); the merge only pulled in T04's UI, container and harness changes, which is why the post-merge row is the meaningful acceptance evidence and the pre-merge numbers are retained above as the original record.

Lease note for this round: no vitest or other database-test process was running, and the only live process was another agent's `next dev --port 3100` (from the T04-review worktree, bound to the **dev** database on 5432). My run resets only `stockflow_test` on 5433, starts no dev server, and leaves the shared services and that process untouched.


## Contract notes (for T07, T09, T10)

- Routes: `GET /api/invoices` (flat `Page<InvoiceSummaryDto>`), `POST /api/invoices` (201 detail), `GET /api/invoices/[id]` (200 detail), `PUT /api/invoices/[id]/items` (200 detail, body `{version, items}`). All are `runtime = "nodejs"`, `no-store`, authenticate before parsing, and check the exact Origin on POST/PUT after auth.
- DTOs: summary `{id, invoiceNumber, customerName, issueDate, dueDate, status, notes, taxRateBps, subtotal, taxAmount, total, version, createdAt, updatedAt}`; detail adds `items[]` = `{id, productId, productName, unitPrice, quantity, lineTotal, position}` ordered by `position` ascending. `userId`/`deletedAt` are never serialized; `issueDate`/`dueDate` are `YYYY-MM-DD`.
- Status mapping: 401 unauthenticated (even malformed input); 403 missing/foreign Origin; 404 foreign, unknown or soft-deleted invoice **and** foreign/unknown/deleted product reference (the product case names the line via `fields["items.<i>.productId"]`); 409 `INSUFFICIENT_STOCK` (`fields["items.<i>.quantity"]`, message names the product), `VERSION_CONFLICT`, `INVOICE_NOT_EDITABLE` (non-draft item edit) and `TRANSACTION_CONFLICT` (retry exhaustion, from T02's mapper); 422 schema/`ARITHMETIC_BOUNDS`; 400 `INVALID_JSON`; 500 sanitized for an invalid `TAX_RATE_BPS`.
- Numbering: `INV-<UTC creation year>-<invoice uuid>`, deliberately nonsequential and id-derived so concurrent drafts cannot collide; the invoice `id` is generated in the service so the number exists before insert.
- Snapshots: creation snapshots current product name/price; replacement reuses the snapshotted name/price for products already on the invoice and snapshots only newly added products; the invoice's stored `taxRateBps` is reused (never re-read from env on edit). Draft creation is the only place `readEnv(...).taxRateBps` is consumed.
- T07 seam: `transitionInvoice`/`assertTransition` and `app/api/invoices/[id]/status/route.ts` are intentionally NOT implemented here (this card forbids a status placeholder). T07 adds them to the same service file and must keep using `withSerializableRetry`, the version guard and the existing snapshot rows.

## Implementation walkthrough

- `snapshotItems` is the single place that turns client lines into persisted snapshots. It loads `{id, userId, deletedAt: null}` products in one query (`IN`), rejects a missing product with a line-indexed 404, rejects `quantity > quantityOnHand` with a 409 naming the product, then picks the retained snapshot when the product was already on the invoice and the current product data otherwise. Because that lookup happens first, a re-submitted deleted product is rejected rather than silently re-snapshotted — the plan's "a draft with a deleted product must drop or replace that line" rule.
- `createInvoice` reads the tax rate before opening the transaction, generates the id and `createdAt` once outside the retry callback (so a retried transaction reuses the same number), and writes invoice + items in one `create`. Drafts never write `Product`, which is exactly why stock stays unreserved.
- `replaceInvoiceItems` fetches the owned invoice with its items, then distinguishes 404 (absent/foreign), 409 `INVOICE_NOT_EDITABLE` (non-draft) and 409 `VERSION_CONFLICT` (stale version) before computing anything. Validation happens before any write, the version-guarded `updateMany` is the race-safe claim, and delete + `createMany` of the whole set is atomic inside the transaction, so a bad line cannot half-apply.
- `listInvoices` mirrors T05's list: `createdAt desc, id asc`, skip/take from the strict query schema, and a count under exactly the same `where` (including the status filter) with the documented empty-page shape.


## Decisions, assumptions and limitations

- Decision: a foreign/unknown/deleted product reference in `items` returns **404** (the plan's "another user's identifier returns 404, including nested product references") and additionally carries `fields["items.<i>.productId"]` so a UI can highlight the offending row; T10 should document this invoice-item variant of the 404 contract.
- Decision: editing a non-draft invoice returns 409 `INVOICE_NOT_EDITABLE` rather than 404, because the resource exists and only its state forbids the operation; repeated/illegal transitions remain T07's concern.
- Assumption: `TAX_RATE_BPS` is read per create (not cached at module load), so a configuration change affects new drafts only while an existing draft always reuses its stored rate. An invalid value is a sanitized 500 and writes nothing.
- Limitation (identical to T05): `findMany` and `count` are two statements outside a transaction, so `total` can differ from `data` by one under a concurrent write.
- Limitation: the schema's `unique(invoiceId, productId)` plus strict duplicate rejection means one product can appear only once per invoice, so "same product twice" is always a 422 and never two lines.
- Limitation: no metadata editing endpoint exists (plan scope), so `customerName`, dates and `notes` are fixed once a draft is created; `PUT .../items` never touches them.
- Not claimed: issue/paid/cancel behaviour, stock deduction or restoration, and any UI (`F3`/`F4`). Non-draft fixtures in this suite are written through Prisma precisely because the status route belongs to T07.

## Review findings and discrepancy log (for coordinator review)

A read-only `review-task-card` pass over this branch was requested by the coordinator. That pass changed no file and executed no application test; it produced the walkthrough now stored at `agent_explanations/T06.md` plus the items below. Corrections inside this worker-owned card are already applied; every decision item is deliberately left untouched for the coordinator.

### Corrections applied to this card

1. **Push-status line equated the tested revision with the remote tip (corrected).** It claimed "remote HEAD verified equal to `09dffee`". The pushed tip is `3103517`; `09dffee` is the tested *code* revision, and `git diff --name-only 09dffee 3103517` shows only this card. No code change follows.
2. **"`origin/main` did not advance" was true only for the first round (corrected).** T04 was accepted and merged afterwards, so main is `f8f2763` and this branch is now integrated with it and re-verified; the numbers are in the post-merge section.
3. **T04 was described as "still unreviewed at dispatch" (corrected).** T04 is now DONE (approved tip `e22cefc`, tested merge `e30b194`), which removes the last scheduling reason to defer the T06 review.

### Decisions requested

4. **A 404 body that carries `fields`.** `productNotFound` returns 404 with `fields["items.<i>.productId"]` — the only 404 in the API with field detail (T05's 404s have none). It is deliberate (the client must know which row to fix) and matches the plan's "foreign identifier returns 404, including nested product references", but T10 has to document it or OpenAPI will look inconsistent. *Keep, or drop the fields and rely on the message?*
5. **`409 INVOICE_NOT_EDITABLE` for non-draft item edits** rather than 404/422: the invoice exists and only its state forbids the operation. *Confirm the mapping before T07 builds on it.*
6. **Item ids are not stable across a replacement** (`deleteMany` + `createMany`), so `InvoiceItem.id` changes on every draft edit and T09 must key rows on `productId`/`position`. *Accept as documented contract, or switch to an upsert-style merge?*
7. **`readEnv(process.env)` on every create**, so an invalid `DATABASE_URL`/`BETTER_AUTH_SECRET`/`TAX_RATE_BPS` turns a draft create into a sanitized 500. *Accept (config errors are 500) or read only `TAX_RATE_BPS`?*
8. **T06 vs the plan's Functions table.** The plan lists `transitionInvoice`/`assertTransition` in `lib/services/invoices.ts`; this task omits them per its card scope and the graph's T07 ownership. *Confirm the split so T07 can add them to the same file.*

### Coverage gaps and awareness items (no change proposed here)

9. **Untested edges:** `PUT /api/invoices/<well-formed-unknown-uuid>/items` is not pinned directly (only the foreign-owner 404 is); retry-exhaustion `409 TRANSACTION_CONFLICT` is not exercised for invoices (T01's unit test covers the helper only); there is no `status` filter combined with pagination case; `updatedAt` semantics are never asserted. All four are purely additive tests.
10. **The fixture uses the module under test:** `createInvoiceFixture` calls `calculateTotals` from `lib/money.ts` to build fixture totals. V2's assertions use hand-computed values (5895/648/6543 and 25/3/28), so only fixture validity is at stake — flagged for an explicit nod.
11. **Write ordering in `replaceInvoiceItems`:** the version-guarded `updateMany` runs before `deleteMany`/`createMany`. Correct inside one transaction (a failing insert rolls the version bump back too); flagged so the lock order on one invoice row plus its items is consciously approved.
12. **`findMany` + `count` are outside a transaction**, so `total` can differ from `data` by one under a concurrent write — inherited from T05 and disclosed rather than fixed.
13. **No `P2002` mapping for `invoiceNumber`.** A collision would be a sanitized 500 instead of a 409; the number embeds a fresh UUID, so it is effectively unreachable. Disclosed, not mapped.
14. **`snapshotItems` comment precision:** it validates stock "for every line", which holds because a retained line must still resolve to an active owned product. Worth stating explicitly when T07 reuses the helper.

### Coordinator rulings (review pass, fix commit `898c219`)

The coordinator reviewed the pinned revision, independently re-ran every gate in the reviewer worktree `.worktrees/T06-review`, and ruled on the items above. Items 4–8 are confirmed as documented contract (no code change), item 9's additive pins are committed, and items 10–14 are accepted with the notes below.

**Merge/integration check (no conflicts in either direction).** `main` (`f8f2763`) is an ancestor of the branch tip, and `git merge-tree --write-tree main task/T06-invoice-drafts` reproduces the branch tree exactly (`ab8f0ed7`) with no conflict reports, so a coordinator merge is clean. The round-2 merge `57d28f8` also reproduces the automatic merge of `f9bd210` + `f8f2763` byte-for-byte (`7618b0b9`), i.e. the T04 integration resolved nothing by hand and dropped nothing, and T06's code paths are byte-identical to `09dffee`.

4. **Keep the line-indexed 404.** `fields["items.<i>.productId"]` stays: the plan requires a 404 for foreign/unknown/deleted nested references, and the field tells a UI which row to fix. T10 must document this invoice-item variant of the 404 contract in the OpenAPI spec. No change.
5. **Confirm `409 INVOICE_NOT_EDITABLE`.** The plan's status mapping puts "transition conflict" in 409 and reserves 404 for unavailable resources; the invoice exists and only its state forbids the edit. T07 reuses the same code and message for illegal transitions. No change.
6. **Accept unstable item ids as contract.** `PUT .../items` is a whole-set replacement and `InvoiceItem.id` is a row identity, not a line identity; T09 keys UI rows on `productId`/`position` and T10 documents it. No change.
7. **Accept `readEnv(process.env)` on create.** Configuration errors are 500 by design (the plan maps them there), the read happens before the transaction opens so nothing half-writes, and it keeps `TAX_RATE_BPS` per-create as V3 requires. No change.
8. **Confirm the T06/T07 split.** `transitionInvoice`/`assertTransition` and `app/api/invoices/[id]/status/route.ts` belong to T07, which adds the functions to the same service file and keeps `withSerializableRetry`, the version guard and these snapshot rows. No change.
9. **Additive pins committed** (see the new deliverable row): well-formed-unknown-id `GET`/`PUT` 404s, a foreign product on `PUT .../items` (404 naming the line, no write), `items: []` on replacement (422 `items`), the `status` filter combined with pagination (first page and past-the-end page), and `updatedAt` refresh after a successful edit / unchanged after a rejected one. Retry-exhaustion `409 TRANSACTION_CONFLICT` is deliberately **not** duplicated: T01's unit suite pins the retry helper and T02's unit suite pins the structural `P2034 → 409` mapping, and forcing three real serialization failures in an integration test would need mocking or a flaky race that proves less than it claims.
10. **Accepted.** `createInvoiceFixture` may call `calculateTotals` for fixture validity; V2's behavioural numbers stay hand-computed (5895/648/6543, 25/3/28, and the half-up 2.75 → 3 case).
11. **Accepted.** The pre-claim `updateMany` ahead of `deleteMany`/`createMany` is safe inside one Serializable transaction (a failed insert rolls the version bump back), and the new `updatedAt` pin shows the write is visible only on success.
12. **Accepted as inherited.** `findMany` + `count` outside a transaction lets `total` differ from `data` by one under a concurrent write; T05 disclosed the same trade-off and T10 records it.
13. **Accepted as unreachable.** A duplicate `invoiceNumber` would sanitize to 500, but the id-derived UUID makes it effectively impossible and a P2002 branch would add reachable-looking untested code.
14. **Accepted**; the `snapshotItems` comment is accurate as written for T07's reuse.

**New defect found and fixed (the "109/109" claim was environment-dependent).** The reviewer run of the pinned revision in a clean worktree with no local `.env` failed 12 of 28 invoice cases — `pnpm test integration`: `97 passed | 12 failed (109)`. Cause: `withTaxRate` restored the variable with `process.env.TAX_RATE_BPS = previous`, and Node coerces `undefined` to the string `"undefined"`, which `lib/env.ts` rejects, so every create after the first rate-switching test answered a sanitized 500. The worker's `109/109` therefore depended on their worktree's git-ignored `.env` supplying `TAX_RATE_BPS=1100`; re-running the *untouched* revision with `TAX_RATE_BPS=1100` exported reproduces `109 passed (109)`, which is the A/B proof. Fixed in `898c219`: `withTaxRate` now restores by deleting when the variable was unset, the file pins its documented 11% baseline instead of inheriting ambient config, and the unset-variable default is exercised explicitly through `withDefaultTaxRate`. The same clean environment then gives `111 passed (111)` with 30 invoice cases. The identical `env.X = previous` pattern in `tests/integration/seed.test.ts` is harmless today because the runner always sets `NODE_ENV`, so it is reported as a T03-owned follow-up rather than edited here.

## Handoff

Completed: all three deliverables — the owner-scoped invoice draft service, the three route modules and the 28-case PostgreSQL suite (V1–V5, V9, V10, A6, A7, N6) — verified at `09dffee`.
Remaining: nothing for T06. T07 owns `transitionInvoice`/`assertTransition` and the status route; T09/T10 consume the contract notes above.
Red/green commands/results: red `sg docker -c 'pnpm test integration'` at `e738746` → exit 1, 27 failed | 81 passed (108); green at `09dffee` → exit 0, 5 files, 109/109 including 28 invoice cases. Also `pnpm test unit` 67/67, `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0 (three invoice routes). Round 2 re-verification on `57d28f8` (after integrating T04's accepted main `f8f2763`): `pnpm install --frozen-lockfile` 0, `pnpm test integration` exit 0 with 109/109 (28 invoice), `pnpm test unit` 78/78, lint/typecheck/build 0 — see the post-merge section above. Round 3 (coordinator review, same worktree, environment with no local `.env` and no ambient `TAX_RATE_BPS`): red at `d33ff8c` → `97 passed | 12 failed (109)`; green at `898c219` → `111 passed (111)` with 30 invoice cases, `pnpm test unit` 78/78, `pnpm lint`/`pnpm typecheck`/`pnpm build` all 0.
Implementation/tested SHA; integrated main SHA: `e738746` (red), `6bbd654` (implementation), `09dffee` (round-1 tested code, adds the retained-snapshot arithmetic-bounds case), `3103517` (round-1 pushed tip), `f9bd210` (round-2 findings commit), `57d28f8` (round-2 merge of main + re-verified revision), `898c219` (round-3 coordinator fix + pins = tested code revision; the commit after it carries this card only); integrated main `6002599` (round 1) then `f8f2763` = `origin/main` after T04's acceptance.
Uncommitted work: none (clean tree; `.env`, `generated/`, `.next` and `node_modules` are ignored local artifacts).
Contract notes: recorded in the section above for T07/T09/T10.
Blockers: none. T04's Playwright removal and container work do not block this task (cross-check section above).
Push/PR status: round 1 was pushed as `task/T06-invoice-drafts` at `3103517`. Round 2 (findings commit `f9bd210`, the main integration `57d28f8`, and the walkthrough/re-verification commit `d33ff8c`) is pushed. Round 3 — the coordinator fix `898c219` and this card's review record — is pushed to the same branch, so the remote tip is the commit carrying this line; verify with `git ls-remote origin refs/heads/task/T06-invoice-drafts` and compare against the chat report. No pull request opened and no main merge attempted or authorized.
Next action: coordinator review is complete (rulings and the environment-independence fix above). Acceptance and the `--no-ff` main merge await explicit user approval; T07 starts only after that, and this worker relinquishes `lib/services/invoices.ts` editing until then.
Coordinator acceptance / merge SHA: Pending — review recorded, merge not authorized.
Proposed central updates (coordinator-owned, not edited here): mark T06 REVIEW in the graph/dashboard, add a T06 acceptance record on merge, and — per the coordinator's explicit instruction in this session — the review walkthrough is being added at `agent_explanations/T06.md` (not a graph-owned path, following the accepted precedent of `agent_explanations/T03.md` and `T04.md`).
