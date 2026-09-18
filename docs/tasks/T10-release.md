# T10 — Swagger and release verification

Status: TODO
Owner: Unassigned
Depends on: T08, T09
Requirement IDs: N1, N2, N3, N4, N5, N6, N7
Branch / worktree / base SHA: Not created
Accepted dependency revisions: Not recorded

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
| OpenAPI/Swagger and tests | NOT_STARTED | Not executed | None |
| Complete README (including the `docker compose up` workflow) and 36-ID ledger with checklist-based F1–F6 evidence | NOT_STARTED | Not executed | None |
| Clean-clone and integrated release verification | NOT_STARTED | Not executed | None |

## Validation

Acquire the postgres-test lease; run all suites, lint/typecheck/build, the clean-clone smoke and the container rehearsal. Record exact commands, exit codes, tested revision and limitations. Missing required behavior or unavailable DB -> BLOCKED, not release-ready. Coordinator reruns necessary gates after merge; workers never push main/deploy.

## Handoff

Completed: None. Remaining: All deliverables.
Red/green commands/results: Not run.
Implementation/tested SHA; integrated main SHA: None.
Uncommitted work: None in task branch; branch not created.
Contract notes: Record Swagger URL, clean-clone evidence and each requirement gap.
Blockers: Dependencies not accepted; task not authorized/assigned; actual-hours input pending.
Push/PR status: Not pushed.
Next action: Coordinator independent review, merge, final validation and user handoff. No successor implementation task.
Coordinator acceptance / merge SHA: Pending.
