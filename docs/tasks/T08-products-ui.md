# T08 — Products UI

Status: TODO
Owner: Unassigned
Depends on: T04, T05
Requirement IDs: F2, F5, F6
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

> **Requirement amendment (user, 2026-09-18):** Playwright and the browser-suite layer were removed from the application (decision record on T04's card), so this card no longer owns `tests/e2e/products.spec.ts` and no browser phase exists in the test runner. UI verification is manual: the reviewer checklist published on T04's card is extended here with the products rows, while automated coverage stays on the API and regression side (T05's integration suite plus lint/typecheck/build). T08 — together with T09 — is additionally authorized to touch the container files (`Dockerfile`, `.dockerignore`, the compose `app` service) where the container work needs changes for its screens.

## Scope and ownership

Own T08 files in `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json` and this card. Follow `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Read frontend Files and product contracts. Shared UI/styles/client helper/pagination and API are read-only. Can edit concurrently with invoice tasks; database-backed suites still serialize on the shared test database.

## Acceptance and test design

- Write the API/integration cases that back these screens first where T05 does not already cover them; the UI itself is not test-driven and is verified through the reviewer checklist rows below.
- Product form parses decimal strings through shared money helper, sends integer cents/version. No floating currency arithmetic or client-only validation claims.
- Each products page independently requires session before loading owned data. Fresh/expired/revoked visitors redirect; foreign edit is not exposed.
- Delayed/failed API shows pending/error/retry, disables duplicate submission, preserves entered values. Accessible labels/table/buttons, no blank error states — reviewer-checklist items, since no browser suite exists.

## Deliverables

| Deliverable | State | Evidence | Verified revision |
|---|---|---|---|
| Products list/search/pagination/deletion UI | NOT_STARTED | Not executed | None |
| Create/edit forms and session checks | NOT_STARTED | Not executed | None |
| Products reviewer verification checklist rows | NOT_STARTED | Extends T04's manual checklist (search, pagination, empty state, delete confirmation, field errors, version conflict); no browser suite exists | None |

## Validation

Acquire the postgres-test lease; run the API/regression suites the screens depend on plus lint/typecheck/build, and extend the container rehearsal if this task changed the container files. Record checklist results with the reviewer's browser and revision instead of browser-test output. Shared changes require pause.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record final routes, accessibility/error behavior and any requested shared changes.
Blockers: Dependencies not accepted; task not authorized/assigned.
Push/PR status: Not pushed.
Next action: After merge T10 also requires T09.
Coordinator acceptance / merge SHA: Pending.
