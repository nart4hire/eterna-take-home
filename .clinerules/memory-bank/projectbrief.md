# Project Brief

StockFlow is the one-day inventory/invoicing take-home defined in `/home/areion/projects/eterna-take-home/project.md`. Deliver secure email/password auth, per-user products, draft invoices with snapshots and exact totals, atomic issue/cancel stock effects, small working UI, PostgreSQL persistence, tests, Swagger, seed and reproducible README.

User-selected stack: existing Next.js App Router/TypeScript/Tailwind, shadcn/ui, Prisma/PostgreSQL in Docker Compose, BetterAuth with bcryptjs, TDD with >=1 test per requirement (36 A/I/V/F/N IDs). Detailed specification: `/home/areion/projects/eterna-take-home/implementation_plan.md`.

**Amendment (AMEND-T04-1, user decision 2026-09-18):** the browser-test layer was removed after planning — Playwright, its dependency, the `test:e2e` script and every `tests/e2e/**` file are gone, and the UI is verified by the reviewer checklist on each owning card instead of browser tests. The same decision puts deployability in scope for T04 (with T08/T09 where necessary): a deliberately simple `Dockerfile`, a `.dockerignore` and an `app` service in `docker-compose.yml` that pin the `mise.toml` versions (Node 24.21.0, pnpm 12.4.2), so a fresh clone only needs a populated `.env` before `docker compose up` runs the migrated and seeded app.

T00 implementation and its main merge are user-approved. Future uniquely identified explicit task dispatches authorize that task's implementation and task-branch push under the skill; main merges require separate approval. No other task has yet been assigned. No OAuth, password reset, email, payments, roles, ledger, multi-currency or elaborate design system. Preserve narrow scope and disclose unfinished work honestly.
