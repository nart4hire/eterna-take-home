# T09 — Invoices UI

Status: DONE — accepted and merged at `b22d2cb` (approved tip `b9c372c`, tested code `b3593a6`)
Owner: T09 worker (single agent, 2026-09-18)
Depends on: T04, T07
Requirement IDs: F3, F4, F5, F6
Branch / worktree / base SHA: branch `task/T09-invoices-ui` in worktree `/home/areion/projects/eterna-take-home/.worktrees/T09-invoices-ui`, created from verified `origin/main` `7bd5f68` (`git worktree add -b`, clean tree, no T09 branch or worktree existed)
Accepted dependency revisions: T04 tested code `f9f3bb93`, approved tip `e22cefc`, tested merge `e30b194`; T07 tested code `ce9c2ab`, approved tip `183d900`, tested merge `38d230f`; T08 (shell contract, not a declared dependency) rework `83fce4d`, tested merge `15d17a7`. All three merges verified as ancestors of the fetched `origin/main` with `git merge-base --is-ancestor` before branching.

> **Requirement amendment (user, 2026-09-18):** Playwright and the browser-suite layer were removed from the application (decision record on T04's card), so this card no longer owns `tests/e2e/invoices.spec.ts` and no browser phase exists in the test runner. UI verification is manual: the reviewer checklist published on T04's card is extended here with the invoice rows, while automated coverage stays on the API and regression side (T06/T07 integration suites plus lint/typecheck/build). T09 — together with T08 — is additionally authorized to touch the container files (`Dockerfile`, `.dockerignore`, the compose `app` service) where the container work needs changes for its screens.

> **Shell contract from T08's accepted rework (coordinator, AMEND-T08-1, 2026-09-18):** the dashboard layout highlights the active section through `components/nav-link.tsx` — a T04-owned client component that resolves the path with `usePathname()` and sets `aria-current="page"` with an accent background. Render the Invoices navigation entry with it (do not edit the component or the layout from this task), and do not add a link to developer documentation: API docs are delivered separately from the client app (spec at `GET /api/openapi.json`, standalone viewer, README-documented URL).

## Scope and ownership

Own T09 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read frontend contracts and invoice snapshot/state rules. No shared UI/API/schema/style edits. ProductPicker belongs here; independent of T08 product forms. Database-backed suites still serialize on the shared test database.

## Acceptance and test design

- Write the API/integration cases that back these screens first where T06/T07 do not already cover them; the UI itself is not test-driven and is verified through the reviewer checklist rows below.
- Existing draft edits preserve snapshot prices and tax; send version, display server-authoritative totals when preview became stale.
- List/filter/pagination/detail expose snapshots/totals; legal issue/paid/cancel actions only, pending disabled, 409 handled with refresh. Separate invoices exercise paid/cancelled terminal paths.
- Every invoices page rejects fresh/expired/revoked visitors; own detail/edit only, draft edit guard. API errors/loading show useful retry, not blank content — reviewer-checklist items, since no browser suite exists.

**TDD position at this revision (recorded because it is a deliberate deviation, as T08 did).** This card asks for API/integration cases "where T06/T07 do not already cover them". The coverage audit performed before coding found no gap: T06's 30 invoice cases already cover create with server-computed snapshots/totals (V2/V3), snapshot retention on draft edits (V4), overstock create/edit rejection naming the product (V5), draft-only item replacement with version guards (V9), list newest-first under a status filter plus complete ordered detail and 422 on bad pagination/status (V10), and 401/403/404/422/N6 behaviour; T07's 25 lifecycle cases cover the full legal/terminal transition matrix, atomic deduction and restore, repeated-action 409s and the race cases (V6/V7/V8). Every endpoint the invoice screens call is therefore already test-backed. No test path is graph-owned for T09 (`tests/unit/**` and `tests/integration/**` belong to T00/T01/T03/T05/T06/T07), and AMEND-T04-1 removed the browser layer, so the rendered screens are verified by the reviewer checklist rows below. Instead of new unit tests this task adds an executable **live HTTP matrix** (Validation section) that drives the real pages against a real PostgreSQL database, so the F3/F4/F5 claims rest on more than a click-through. No test was weakened, skipped or faked, and no placeholder implementation was introduced.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Invoice form/edit and paginated product picker | VERIFIED | `components/invoice-form.tsx` (create and edit modes; metadata shown read-only when editing because only `{version, items}` may be replaced; per-line quantity editing with line totals; live preview built by the shared `calculateTotals`, labelled provisional; server `fields` rendered inline on `items.N.quantity`/`items.N.productId`; `VERSION_CONFLICT` reloads the saved draft, `INVOICE_NOT_EDITABLE`/404-without-fields point at the invoice, item 404s stay inline; pending disables every control; values preserved with a retry) · `components/product-picker.tsx` (client-side paginated `GET /api/products` search at 20 per page with previous/next paging past the first 100 products, add/added state, empty, failure and retry states) · `app/(dashboard)/invoices/new/page.tsx` (server-side `TAX_RATE_BPS` and server-computed UTC issue-date default) · `app/(dashboard)/invoices/[id]/edit/page.tsx` (own session check, validated path id, draft-only guard) | `05d503f` |
| List/detail/status actions | VERIFIED | `app/(dashboard)/invoices/page.tsx` (own session check, strict `invoiceListSchema` query parsing, empty `?status=` normalised to all statuses, out-of-range page clamp) · `components/invoice-list.tsx` (GET-form status filter that survives without JavaScript, status badges with text, saved totals, shared `Pagination` reuse, separate filtered and unfiltered empty states) · `app/(dashboard)/invoices/[id]/page.tsx` (snapshotted line names/prices/quantities, subtotal/tax/total from the server, per-status explanation, draft-only edit link) · `components/invoice-actions.tsx` (only legal transitions, each behind a confirmation naming the stock consequence, pending disables every control, 409 refreshes the route, terminal states render no actions instead of dead buttons) | `05d503f` |
| Invoices reviewer verification checklist rows | VERIFIED (rows published; the browser pass itself belongs to the reviewer) | The section "Invoices reviewer verification checklist rows" below extends T04's checklist section C with the invoice rows, and the implementer's supporting execution evidence is the 105/105 live HTTP matrix recorded in Validation. No browser suite exists (AMEND-T04-1) and no Chromium can run in this environment (`libnspr4` missing, no root), so the interactive rows stay reviewer-checklist items | `05d503f` |

## Invoices reviewer verification checklist rows (extends T04's section C; F3, F4, F5, F6)

No browser suite exists (AMEND-T04-1) and no Chromium can run in this environment, so these rows are the reviewer's instrument. They assume the reviewer's own signed-in workspace with at least one product; a bulk helper for the "past the first 100" row is in item E.

**A. Creation and live totals (F3)**

- [ ] `/invoices` shows the heading, the "New invoice" button and the status filter.
- [ ] `/invoices/new` opens with both dates defaulted to today; the picker lists the catalogue and reports "Showing 1–20 of N matching products".
- [ ] Searching the picker by product name and by SKU narrows the list; Clear restores the full catalogue.
- [ ] The picker's Next/Previous buttons walk the pages, and with more than 100 products a later page still shows rows (the address and the API are unchanged — paging is client state).
- [ ] A row already on the invoice reads "Added" and cannot be added twice; its "Add line" button is disabled.
- [ ] Adding a second product gives two lines; changing a quantity updates that line's total and the subtotal, tax (11%) and total immediately, without a request.
- [ ] Saving lands on the new draft's detail page, and the saved subtotal/tax/total equal what the preview showed (the preview uses the same integer-cent helper the server uses).
- [ ] Creating with an empty customer name, an empty due date or no lines reports the problem next to the field and does not navigate; the typed values stay.
- [ ] A quantity above the product's stock is rejected by the server with the message naming the product next to that line, and nothing is created.
- [ ] With no products at all, the picker says so and links to "/products/new".

**B. List and status filter (F4)**

- [ ] The list shows the draft's number, customer, issue date, due date, status badge, total and a View link.
- [ ] The status filter narrows to Draft / Issued / Paid / Cancelled, keeps the choice in the address (`?status=INVOICE_STATUS`) and Clear restores every invoice.
- [ ] An empty result explains itself ("No <status> invoices." plus Clear the filter) instead of showing an empty table.
- [ ] Entering an unknown status in the address shows the "Those search parameters are not valid" state with a reset link, not a blank page.

**C. Detail and status actions (F4)**

- [ ] The detail page shows the snapshotted product names, unit prices, quantities and line totals plus subtotal, tax and total, the notes, and a sentence explaining what the current status means for stock.
- [ ] Renaming, repricing or deleting one of the products in `/products` and reloading the invoice does not change its saved lines or totals (snapshots).
- [ ] A draft offers only "Issue invoice" and "Cancel draft"; each opens a confirmation that spells out the stock effect.
- [ ] While a transition runs the confirm button reads "Working…" and every control is disabled, so a second click cannot submit (F6).
- [ ] After issuing: the status becomes Issued, the product's stock in `/products` drops by the line quantities, and the actions become "Mark as paid" and "Cancel invoice"; the draft edit link is gone.
- [ ] Opening `/invoices/<issued-id>/edit` lands on the detail page instead of showing an editable form.
- [ ] After cancelling an issued invoice the stock returns exactly once and no further action is offered; a paid or cancelled invoice shows the terminal note and no buttons.
- [ ] Two tabs on one draft: saving in the second tab reports "This draft changed in another session" and shows the reloaded saved lines; issuing in the other tab and then saving reports that the invoice cannot be edited and links to it.
- [ ] Issuing an invoice whose line references a product deleted in the meantime reports the problem and offers "Edit the draft lines" to remove it.
- [ ] With the API unreachable (browser offline), saving shows a network message with a retry and keeps the typed values.

**D. Session, shell and boundaries (F5, F6)**

- [ ] Signed out, `/invoices`, `/invoices/new`, an invoice detail and an invoice edit URL all redirect to `/login` (the pages answer 307 before rendering anything).
- [ ] Signing out and then using Back does not show private content: the next API call answers 401 and the client navigates to `/login`.
- [ ] Another user's cookie (or a deleted session row) redirects the same way instead of rendering someone else's invoice.
- [ ] The Invoices navigation entry is highlighted on all four invoice routes and Products is not; nothing in the shell links to developer documentation.
- [ ] Navigating between invoice screens shows the dashboard loading skeleton, and a failing page shows the dashboard error boundary's retry rather than a blank page. The boundaries no current screen can trigger stay "not exercisable" (T10 records that).

**E. Re-running the implementer's evidence**

```sh
# gates (from the task worktree; the integration subset needs the postgres-test lease)
pnpm install --frozen-lockfile
pnpm test:unit
pnpm lint
pnpm typecheck
pnpm build
sg docker -c "cd <worktree> && pnpm test:integration"

# the live HTTP matrix used for this revision (byte-identical copies: /tmp/t09-live-matrix.sh and appendix A of agent_explanations/T09.md)
# it registers its own user against a leased dev server, creates fixtures, then checks pages:
BASE=http://localhost:3102; ORIGIN=$BASE; JAR=/tmp/t09-cookies.txt; OUT=/tmp/t09-body.html

# bulk helper for the "past the first 100 products" row (100 products in the signed-in workspace)
for n in $(seq 1 100); do curl -s -o /dev/null -X POST "$BASE/api/products" -b "$JAR" \
  -H "origin: $ORIGIN" -H 'content-type: application/json' \
  -d "{\"sku\":\"BULK$(printf '%03d' "$n")\",\"name\":\"Bulk Product $(printf '%03d' "$n")\",\"unitPrice\":999,\"quantityOnHand\":10}"; done
```

## Review addendum (worker self-review, 2026-09-18)

Requested by the coordinator after the REVIEW handoff ("do review-task-card for task T09 and put it in agent_explanations … put any discrepancies in your task card"). Reviewed revision: the branch tip that carried the tested implementation `05d503f`; comparison base `7bd5f68`. The review read the eight files at that revision, compared every claim in this card against the code, and **repaired nothing** — the branch stays at the tested revision so each item below is a coordinator decision, exactly as T08's O1–O10 were.

Review record: `agent_explanations/T09.md` — a `review-task-card`-style walkthrough written at the coordinator's direction (self-review, not independent acceptance): summary/target, requirements and scope, architecture and mental model, a file-by-file walkthrough with line references and a concrete end-to-end path, a correctness/edge-case/security table, the evidence map with recorded red/green, this findings list, and **appendix A carrying the live HTTP matrix script byte-identically** to the executed one (verified by re-extracting and comparing). That appendix is the durable home for the script T08 recorded as homeless (T08's O9).

### Findings awaiting a coordinator ruling

| # | Finding | Severity | Suggested resolution |
|---|---|---|---|
| O1 | `components/invoice-list.tsx:53-65` — the status `<select>` is uncontrolled with an always-present `defaultValue`, so React 19 does not push a present-to-present change into the DOM: after **Clear** (or Back/Forward between two filtered addresses) the dropdown may keep showing the previous status while the rows reflect the URL. Source-level analysis, not reproducible here (no browser can start); reviewer row B2 confirms. | cosmetic | if confirmed, `key={status ?? "all"}` on the select or make it controlled |
| O2 | `components/invoice-actions.tsx:201` — the footnote reads "Draft version N" on **issued** invoices too. | cosmetic wording | change to `Version {invoice.version}: …` |
| O10 | `components/invoice-form.tsx:522-550` — a transport failure keeps the typed values but has no explicit retry; the still-enabled submit button is the retry, so this card's phrase "transport failures keep a retry" is looser than the code (`invoice-actions.tsx` does have a "Try again"). | documentation/UX choice | tighten the card wording, or add a retry button |
| O3 | The filter always submits `?status=`, even for "All statuses" (normalized away by the page at `app/(dashboard)/invoices/page.tsx:36`), so addresses carry a redundant parameter. | cosmetic | optional empty-value guard |
| O4 | The live matrix is narrower than the checklist suggests: it exercised DRAFT→ISSUED and DRAFT→CANCELLED but never an ISSUED→PAID transition, executed no component JavaScript (so the picker pager and the dialogs are unproven by it), and asserted the active-navigation highlight only on `/invoices`. Those paths are code-reviewed and (for PAID) API-tested by T07; rows B2/C5/C8/D4 close the gap in the browser. | coverage disclosure | reviewer closes it during the browser pass |
| O5 | Lifecycle labels/badge variants exist in both `components/invoice-list.tsx:20-42` and `app/(dashboard)/invoices/[id]/page.tsx:23-52`, and `taxRateLabel` in both `components/invoice-form.tsx:39` and the detail page — forced by ownership, not an accident. | maintainability | leave, or collapse in a future shared-primitives task |
| O6 | `components/invoice-actions.tsx:36-72` mirrors the service's transition table for rendering; a future T07 change could silently desynchronize the buttons (the server still refuses illegal actions, so the failure is a confusing 409). | maintainability | comment already present; no owned test path can pin it |
| O7 | A draft's customer, dates and notes cannot be corrected after creation, because the only shipped editor contract is `PUT …/items` with `{version, items}`. | scope, matches the plan | accept, or plan a metadata PATCH in a later task |
| O8–O9, O11–O12 | Streamed redirect/meta-refresh behaviour for the draft gate and the page clamp; static page `title`s (no `generateMetadata`); this walkthrough and the matrix script living outside graph-owned paths by user direction; a misconfigured `TAX_RATE_BPS` surfacing as a page error on `/invoices/new` rather than an API shape. | notes | recorded so they are not mistaken for oversights |

Two decisions this addendum does **not** make: it does not patch O1/O2/O10 (that would invalidate `05d503f` as the tested revision and needs a newly authorized rework commit), and it does not accept the task. `agent_explanations/T09.md` is user-directed documentation outside this task's graph-owned paths, following the T00–T08 precedent; the review database `stockflow_t09` and the matrix fixtures described in the walkthrough (O12) remain in the dev container so appendix A can be re-run.

## Validation

*(Original instruction: acquire the postgres-test lease; run the API/regression suites the screens depend on plus lint/typecheck/build, and extend the container rehearsal if this task changed the container files; verify displayed totals against the actual server response manually; record checklist results with the reviewer's browser and revision; do not change stock/status rules to simplify UI.)*

**Recorded results at `05d503f`** — worktree `/home/areion/projects/eterna-take-home/.worktrees/T09-invoices-ui`, branch `task/T09-invoices-ui`, base `origin/main` `7bd5f68`. The explicit integration pull reported "Already up to date", so `origin/main` had not advanced and the block below is the post-integration run.

| Gate | Command | Result |
|---|---|---|
| Frozen install | `pnpm install --frozen-lockfile` | exit 0 |
| Unit | `pnpm test:unit` | 8 files, 79/79, exit 0 (pre-existing suite; no test path is graph-owned for T09) |
| Integration (real PostgreSQL, `postgres-test` lease) | `sg docker -c "cd <worktree> && pnpm test:integration"` | 6 files, 136/136, exit 0 (25 T01 + 27 auth + 4 seed + 25 products + 30 invoices + 25 lifecycle) |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Build | `pnpm build` | exit 0; the route table gained `ƒ /invoices`, `ƒ /invoices/[id]`, `ƒ /invoices/[id]/edit`, `ƒ /invoices/new` beside the five API route families |

**Live HTTP matrix — 105/105 at `05d503f`.** Driven against a leased `next dev` on port 3102 (never the primary checkout; the primary's own dev server on 3000 was left running and untouched) with the worktree's own database, so no demo or shared test data was disturbed:

- **leases and databases.** The `next-dev` lease was taken on port 3102 for this run and released afterwards (the port no longer listens); `postgres-test` was used only for the integration suite. The review data lives in a dedicated `stockflow_t09` database created inside the already-running dev PostgreSQL container, migrated with `prisma migrate deploy` and seeded with the idempotent demo seed (`TAX_RATE_BPS=1100`, `BETTER_AUTH_URL=http://localhost:3102`); the worktree's `.env` is git-ignored, mode 0600, holding a locally generated auth secret. The dev database `stockflow` and the test database `stockflow_test` were not written to.
- **fixtures.** The script registers its own user through the shipped auth routes, creates three products at 1250 cents, a two-line draft, one invoice that is issued and one that is cancelled, plus 100 bulk products for the paging check.
- **checks.** Fixture creation 201/200; saved totals 2×1250 + 3×1250 = 6250 subtotal, 688 tax (half-up), 6938 total; six catalogue pages reach all 103 products with page 6 past the first 100; `/invoices` shows the draft number, the customer and `$69.38`; `?status=ISSUED` and `?status=CANCELLED` list only their own invoice; `?status=PAID` renders "No paid invoices." with Clear the filter; an empty `?status=` means all statuses; an unknown status and `?page=0` render the invalid-parameter state instead of erroring; `?page=99` answers 200; the draft detail shows the snapshot names, the `$12.50` unit price, the `$25.00`/`$37.50` line totals, `$69.38` and the notes, plus Issue/Cancel/Edit links and no "Mark as paid"; the issued detail offers Mark as paid and Cancel invoice and no edit link; the cancelled detail explains the restored stock with no actions; `/invoices/new` renders the customer field, the picker, "Tax (11%)" and the server-computed default issue date; the draft edit screen seeds both quantity inputs, the snapshot price and the same `$69.38` total; `/invoices/<issued-id>/edit` is a streamed redirect (HTTP 200 with one `NEXT_REDIRECT` marker — the framework behaviour T08 recorded as O3) and contains no quantity inputs; unknown ids, malformed ids and another owner's invoice render "Page not found" without leaking the invoice; all four invoice routes answer 307 to `/login` for a signed-out visitor.
- **shell.** The Invoices entry carries `aria-current="page"` on the invoice pages and exactly one navigation entry is marked active; no invoice page links to `/docs`.
- **Next.js MCP on the leased port.** 9 tools discovered, `get_project_metadata` scoped to this worktree, `get_routes` listing the four invoice pages, `get_compilation_issues` empty. `get_errors` needs a connected browser session and `compile_route` rejected the bridge's string argument, so neither contributed evidence; the route fetches above compile and render every screen anyway.

**Disclosed artefact (no code, contract or test was changed to make a check pass).** The first matrix run reported 3 failures out of 102, and all three were defects in my own assertions rather than in the application: React's server renderer separates adjacent interpolated text nodes with HTML comments, so `No paid invoices.` and `Tax (11%)` appear as `No <!-- -->paid<!-- --> invoices.` and `Tax (<!-- -->11%<!-- -->)`, and the 80-character window after `aria-current="page"` cut off the link's `href` even though the markup was already `<a aria-current="page" … href="/invoices">Invoices</a>`. The text assertions now run against a comment-stripped copy of the HTML — what a visitor actually reads — and re-running the unchanged code passed 105/105.

**Limitations.** The interactive rows (live-total equality while typing, the pending/disabled confirmation state, dialog behaviour, offline retry, the highlight during client-side navigation) cannot be executed by automated tooling here: AMEND-T04-1 removed the browser layer, the cached Playwright Chromium cannot start (`libnspr4.so` is absent and installing it needs root), and `next-devtools` reports no browser session. They therefore stay reviewer-checklist rows, not claims of a passed browser run. The preview-versus-saved equality is supported by reusing the server's own `calculateTotals` and by the seeded edit screen showing `$69.38`, the exact total the API returned; the click-through itself is row A7.

## Handoff

Status: REVIEW — worker signal only. REVIEW is not DONE; the coordinator owns acceptance, the merge into `main` and the central status record.

Completed: all three deliverables at `05d503f` — the create/edit form with the paginated product picker and live totals, the list/detail/status-action screens with per-page session checks, and the invoice reviewer checklist rows. Eight new files: `app/(dashboard)/invoices/page.tsx`, `app/(dashboard)/invoices/new/page.tsx`, `app/(dashboard)/invoices/[id]/page.tsx`, `app/(dashboard)/invoices/[id]/edit/page.tsx`, `components/invoice-form.tsx`, `components/product-picker.tsx`, `components/invoice-list.tsx`, `components/invoice-actions.tsx` (1543 added lines); no existing application file was edited, and no dependency, schema, contract or test file changed. This card is the only documentation change.
Remaining (outside T09): the reviewer's browser pass over the checklist rows, coordinator review/acceptance/merge, and T10's Swagger/README work plus the per-requirement-ID checklist ledger.
Red/green commands and results: see Validation — every gate green at `05d503f` (install 0, unit 79/79, integration 136/136 on real PostgreSQL, lint 0, typecheck 0, build 0) plus the 105/105 live HTTP matrix, the MCP route/compilation checks, and the disclosed 3-check assertion artefact. The UI has no red phase by AMEND-T04-1, and the deliberate absence of new test files is explained in the TDD position above.
Implementation/tested SHA: `05d503f` (all executable content). Integrated main SHA: `origin/main` `7bd5f68` — unchanged, so the explicit no-rebase integration pull answered "Already up to date" and the recorded gates are the post-integration run on this revision.
Uncommitted work: none in the task branch; the worktree carries only ignored `.env`, `node_modules`, `generated/` and `.next/` content.
Contract notes for T10: routes are `/invoices` (status filter `?status=`, `?page=`), `/invoices/new`, `/invoices/[id]` and `/invoices/[id]/edit`; the screens call the shipped endpoints `GET/POST /api/invoices`, `GET /api/invoices/[id]`, `PUT /api/invoices/[id]/items` (strictly `{version, items}` — customer, dates, notes and the tax rate are frozen at creation) and `PATCH /api/invoices/[id]/status`, plus `GET /api/products?search=&page=&pageSize=` at 20 rows per picker page. The create page reads `TAX_RATE_BPS` on the server and the preview uses those integer basis points; the edit screen uses the rate persisted on the draft and the server stays authoritative, so the UI labels every preview provisional. Conflict handling: `VERSION_CONFLICT` reloads the saved draft and asks the user to review; `INVOICE_NOT_EDITABLE` and 404-without-fields point at the invoice or the list; item-scoped 404/409 messages render inline on `items.N.productId`/`items.N.quantity`; transport failures keep a retry with the typed values. An empty `?status=` means "all statuses" (the filter's default option) while an unknown value renders the invalid-parameter state. There are deliberately no URL-sticky success notices (a create or edit navigates to the invoice itself), unlike observation O1 on T08. Terminal invoices render no action buttons and a paid/cancelled invoice offers no edit link. The client app still exposes no developer documentation, and the Invoices navigation entry uses the T08 `NavLink` active state.
Blockers: none.
Push/PR status: `task/T09-invoices-ui` was pushed and verified at `252bec3` (tested implementation `05d503f`). This review addendum and `agent_explanations/T09.md` are a further documentation-only commit on the same branch; it is pushed after that commit, the resulting tip is verified against the remote, and it is reported in the assignment channel rather than in another self-referential card commit.
Next action: coordinator review and acceptance; T10 (Swagger, README, 36-ID ledger) stays gated on the accepted merge of this task. No successor is started automatically and `main` is never touched from this branch.

## Rework after the reviewer's browser pass (2026-09-18)

**O13 — browser-confirmed defect, fixed.** The reviewer's browser pass reported React's "In HTML, `<form>`
cannot be a descendant of `<form>`" hydration error on `/invoices/new` while checking row C2 (snapshot
retention after deleting a product). Root cause: `components/product-picker.tsx` rendered its search control
as a `<form>` while `components/invoice-form.tsx:286` wraps the picker in the invoice `<form>`, so
`/invoices/new` and every draft `/invoices/[id]/edit` response carried two `<form>` start tags with the second
nested (`grep -o '<form' | wc -l` = 2 on the served HTML). HTML parsing ignores a nested form start tag, so the
browser DOM and React's client tree diverged at hydration. It is a static screen defect, unrelated to the
product-delete flow that surfaced it, and invisible to both the worker's 105-check matrix and the reviewer's
42-check matrix, which passed at `08b52a7` — it only manifests in a browser.

**Fix — `413151f`.** The picker owns no form now: the search row is a `div role="search"` with a
`type="button"` "Search catalogue" control, and the input's `onKeyDown` intercepts Enter and runs the search —
without that interception Enter would have submitted the enclosing invoice form once the inner form was gone.
Search, Clear, disabled and `aria-busy` behaviour are unchanged; the redundant `name="search"` was dropped
because nothing submits it. No contract, schema, style, shared component or test file was touched;
`components/product-picker.tsx` is T09-owned.

**Verification at `413151f`** (worktree `.worktrees/T09-invoices-ui-rework`, branch `task/T09-invoices-ui`):
`pnpm install --frozen-lockfile` 0; `pnpm test:unit` 79/79 (8 files); `pnpm test:integration` 136/136 (6 files on
real PostgreSQL under the `postgres-test` lease); `pnpm lint` 0; `pnpm typecheck` 0; `pnpm build` 0. The
reviewer's live matrix re-ran against a `next dev` on the leased port 3100 over the review database
`stockflow_t09` — **42/42**, including three new structural checks that fail before this commit and pass after
it: `/invoices/new` serves exactly one `<form>` while keeping the picker input and search control, and a draft
`/invoices/[id]/edit` serves exactly one `<form>`.

**O14 — reviewer observation, not a defect (recorded for T10, no change made).** An unknown, malformed or
foreign invoice id answers **HTTP 200** with the not-found UI rather than 404, because `notFound()` runs after
the RSC shell has streamed; it reproduces in dev *and* in `next start` over the production build, while a
genuinely unmatched route (e.g. `/products/nope`) is a real 404. No invoice data leaks (invoice number and
customer absent for a foreign owner) and a signed-out visitor still gets a true 307 to `/login`.

**Open items unchanged, none of them a blocker:** O1 (uncontrolled status `<select>` keeps its old selection
after Clear; the fix is `key={status ?? "all"}`), O2 ("Draft version N" also shown on issued invoices), O3
(redundant `?status=` on "All statuses"), O4 (no automated coverage of component JavaScript), O10 (no explicit
retry button on the create form's transport failure).

**Push status.** `413151f` plus this documentation commit are pushed to `origin/task/T09-invoices-ui`; the
branch stays unmerged and `main` is untouched. REVIEW is not DONE — coordinator acceptance and the merge
remain outstanding.

## Small-fix pass before acceptance — `b3593a6` (2026-09-18)

The user directed that every outstanding small finding be fixed and re-verified before acceptance. Four
T09-owned files changed, +23/−2, no contract, schema, service, shared component or test file touched:

| Item | Resolution |
|---|---|
| O1 | `components/invoice-list.tsx` — `key={status ?? "all"}` on the status `<select>`. React never re-applies `defaultValue` to an uncontrolled select, so the committed status now remounts the control and the dropdown can no longer keep a stale choice after Clear or Back/Forward. |
| O2 | `components/invoice-actions.tsx` — the footnote reads "Version {n}:" instead of "Draft version {n}", so it is accurate on issued invoices too. |
| O3 | `app/(dashboard)/invoices/page.tsx` — an explicitly empty `?status=` (the filter's "All statuses" option) is normalised away through the same streamed `redirect()` the page clamp already uses: the canonical all-statuses address is `/invoices`, keeping `?page=` when it is past the first page. **Contract note for T10:** the earlier "an empty `?status=` means all statuses" is now "an empty `?status=` redirects to the canonical address". |
| O10 | `components/invoice-form.tsx` — a `retryable` flag plus a "Try again" submit button inside the failure alert, shown only for failures a re-submit can fix (transport or 5xx); the transport message now states that nothing was saved. Validation, version-conflict, not-editable and 404 paths keep their own recovery controls and offer no retry. |

**Verification at `b3593a6`** (worktree `.worktrees/T09-invoices-ui-rework`, branch `task/T09-invoices-ui`):
`pnpm install --frozen-lockfile` 0; `pnpm test:unit` 79/79 (8 files); `pnpm test:integration` 136/136 (6 files on
real PostgreSQL under the `postgres-test` lease); `pnpm lint` 0; `pnpm typecheck` 0; `pnpm build` 0. The reviewer's
live matrix re-ran on the leased port 3100 over `stockflow_t09`: **45/45**, adding three checks for this pass —
the status dropdown renders the committed status as selected (O1, server side), the issued detail no longer
contains "Draft version" (O2), and an empty `?status=` normalises to the canonical address (O3).

**Residual evidence gap (disclosed, not a claim of a pass):** O1's client-side remount and O10's "Try again"
button cannot be exercised without a browser, so they rest on the source semantics above plus lint/typecheck/build
and remain browser rows. O4 therefore stays open as a coverage disclosure, and O5–O9, O11–O12 remain recorded
notes; O13 is fixed in `413151f` and O14 is recorded for T10.
Coordinator acceptance / merge SHA: accepted and merged at `b22d2cb19ce8d46ffc02168770839ab788334d8c` over base `7bd5f68` (`--no-ff`, no conflicts, merge tree byte-identical to the branch tree) from approved tip `b9c372c` and tested code `b3593a6`. The branch is frozen at `b9c372c`; later fixes require a newly authorized rework branch.

**Post-acceptance browser confirmation (user, 2026-09-18, merged revision):** the two rows the reviewer could not execute were checked in a browser and both are OK — O1 (after Clear and Back/Forward the status dropdown matches the rows) and O10 (a failed create says nothing was saved and offers a working "Try again" that keeps the typed values), plus the O13 fix (one form per invoice screen). No disclosed limitation remains for O1/O10 or O13; O4 stays a coverage disclosure and O14 is recorded for T10.
