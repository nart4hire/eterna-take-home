<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## StockFlow task execution

Before an assigned implementation task, read all six core files in `/home/areion/projects/eterna-take-home/.clinerules/memory-bank/`, the graph at `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json`, its guide at `/home/areion/projects/eterna-take-home/docs/execution/dependency-tree.md`, the assigned card, and `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. Other agents must read the skill explicitly if it is not auto-discovered.

Workers must not edit primary-checkout project files or run app installs/tests there. Each agent creates its own `<PRIMARY>/.worktrees/<task-id>-<slug>` on `task/<task-id>-<slug>` from verified origin/main, then edits/tests/commits/pushes exclusively there. PRIMARY is coordinator-confirmed; `/.worktrees/` must already be ignored. After a verified push and durable REVIEW handoff, remove only the owned clean worktree without force, checking ignored artifacts/processes first; retain branches. Preserve worktrees on blockers/conflicts/failures. Follow the skill's full lifecycle/resumption gates. Rebase the canonical workspace prefix onto the actual assigned worktree. Confirm authorization and accepted/merged dependencies; branch before tests/code, use TDD, integrate latest origin/main and revalidate before pushing only the task branch. Pause for conflicts/blockers; never automatically resolve/abort/reset/rebase/stash/force-push. Separate worktrees still share test DB/ports: acquire coordinator leases.

Workers edit only graph-owned paths and their own card. Central memory bank/graph/plan/skill updates belong to coordinator; submit proposed changes in handoff. Record deliverable evidence and tested revisions; REVIEW is not DONE. Coordinator independently accepts/merges/verifies before successors start. Current planning-resource work does not authorize application implementation.

## Next.js runtime tooling for agents (Next 16.3.5)

The bundled docs under `node_modules/next/dist/docs/` stay the source of truth (managed block above). Read `01-app/02-guides/ai-agents.md` and `01-app/02-guides/mcp.md` before relying on this note. On tasks that touch the UI, start the dev server in the task worktree on a leased port before verifying anything: `pnpm dev --port <leased>` (never in the primary checkout, never reusing another agent's server, and stop it before worktree removal).

Why: `next dev` writes its PID, port and URL to `.next/dev/lock`, so a second `next dev` in the same project reports the running server instead of starting a duplicate; and the Next.js MCP endpoint at `/_next/mcp` (bridged by `next-devtools-mcp` from the project's `.mcp.json`) exposes `get_errors`, `get_logs`, `get_page_metadata`, `get_project_metadata`, `get_routes`, `compile_route` and `get_compilation_issues` — route, compilation and runtime evidence without a full `next build`.

The browser half of that workflow (DOM/console/React tree through `agent-browser` or Playwright MCP) needs Chromium plus `libnspr4`, `libnss3` and `libasound2`, which require root (`playwright install-deps`) on this machine. Until that is available, UI verification stays with the owning card's reviewer checklist plus the MCP framework tools and direct HTTP checks; application code must not depend on a browser-test runner (see AMEND-T04-1).
