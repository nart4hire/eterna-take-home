# Technical Context

Workspace: `/home/areion/projects/eterna-take-home`. Installed template: Next.js 16.3.5, React 19.2.8, TypeScript 5, Tailwind v4, ESLint 9. Node 24.21.0, pnpm 12.4.2. Existing scripts: dev/build/start/lint. No application test harness, ORM/auth/UI kit installed yet.

Read relevant bundled guides in `/home/areion/projects/eterna-take-home/node_modules/next/dist/docs/` before code. Dynamic params/headers/cookies are async. Root middleware convention deprecated in favor of optional proxy; do not rely on proxy/layout for authorization.

Planned additions: stable matching Prisma 7 CLI/client/pg adapter, BetterAuth 1.7, bcryptjs 3, Zod 4, Vitest 5, Playwright, local swagger-ui-dist and shadcn selected components. Resolve compatible versions and lockfile before implementation; Prisma latest registry returned an 8 prerelease, so do not blindly install latest.

Docker command unavailable in WSL: enable Docker Desktop integration/Engine before PostgreSQL tests. Dev DB planned localhost:5432; isolated stockflow_test on localhost:5433. No SQLite substitutions. ripgrep unavailable; use grep/find. Use file-reading/editor tools for controlled changes. Environment secrets must stay ignored; template .gitignore currently also ignores .env.example, requiring future explicit exception.
