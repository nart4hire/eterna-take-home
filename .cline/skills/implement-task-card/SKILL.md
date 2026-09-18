---
name: implement-task-card
description: Implement one assigned StockFlow task using an isolated branch, test-first development, upstream synchronization, verification and evidence-based handoff. Stop for merge conflicts, ownership violations or blockers.
compatibility: Requires explicit coding and task-branch push authorization, Git, pnpm and Docker for PostgreSQL checks. Other agents may read this skill explicitly.
---

# Implement one task card

## Mandatory stop rules

A skill is not authorization. Honor user/tool permissions; no coding in Plan mode. Pause for merge conflicts, unexplained working changes, unfinished Git operations, branch divergence, rejected pushes, unavailable infrastructure, ambiguous contracts, unowned files/dependencies or unexpected regressions. Expected red tests for assigned behavior are normal. Never weaken tests to hide failure.

On conflict STOP: do not resolve, abort, reset, rebase, stash, force-push or continue coding. Preserve state; only read-only diagnostics such as git status and git diff --name-only --diff-filter=U. Report failing command, conflicts, branch/HEAD/base and decision needed. If card editing is unsafe, report BLOCKED in chat for coordinator to record. Redact secrets.

## 1. Qualify assignment

Read AGENTS.md, all six core memory files, assigned card, graph and relevant plan headings. Canonical root: `/home/areion/projects/eterna-take-home`; obtain actual worktree root with git rev-parse --show-toplevel and replace documented absolute prefixes. Never write another checkout.

Resources: `/home/areion/projects/eterna-take-home/docs/execution/dependency-graph.json`, `/home/areion/projects/eterna-take-home/docs/execution/dependency-tree.md`, `/home/areion/projects/eterna-take-home/implementation_plan.md`. Inspect actual code/scripts/status. Task must be READY/exclusively assigned; dependencies accepted and merged on origin/main, including planning baseline. Confirm coding/task-branch push authorization. Central graph/skill/plan/AGENTS/memory bank are read-only to workers; propose changes in your card.

### Short dispatches and dependency evidence

In this project's authorized workflow, an imperative dispatch such as "please work on T001" assigns that task to the receiving worker and authorizes implementation, commits and task-branch push (never main merge). Normalize numeric IDs against the graph: T001 -> T01, T000 -> T00, T010 -> T10. Require a unique existing match; do not invent tasks. This dispatch supplies READY/exclusive assignment unless another active owner is recorded; do not demand a separate READY bookkeeping commit or repeat an already granted authorization. PRIMARY is `/home/areion/projects/eterna-take-home`, verified against the worktree registry; derive the slug from the canonical card. Shared DB/port leases still require an explicit grant before use. Plan mode remains read-only.

Dependency cards on retained branches are historical handoffs. REVIEW, "Coordinator acceptance / merge SHA: Pending", and "only after DONE dispatch ..." are not blockers when acceptance and merged verification are established. Fetch origin, identify the approved task SHA from coordinator/PR/merge evidence, and verify `git merge-base --is-ancestor <approved-task-sha> origin/main`. Use coordinator acceptance/verification evidence (central record, approved PR or durable handoff) plus this ancestry check, not stale card wording. An unapproved branch merely pushed to origin is not accepted. If the branch still exists, verify its tip matches the approved SHA; new commits after approval require review, not silently extending acceptance. Missing/contradictory approval, failed ancestry, unknown ownership or failed verification still blocks.

Never add a dependency-card/DONE commit to an approved task branch, merge main back into it, amend it or recreate its worktree just to fix Pending text. Start the successor from verified origin/main and record the dependency evidence in the successor's own card.

## 2. Create your own feature worktree before edits

Do not edit files, install dependencies, run application tests/builds, or switch branches in the primary checkout. This prohibition covers root-level project files AND its source subdirectories; root-level files inside your feature worktree remain editable if graph-owned. Only read-only inspection, authorized Git administration, and creation/removal of your own child worktree are allowed from the primary checkout. Coordinator documentation maintenance is a separate role, not a worker exception.

Coordinator supplies the verified absolute PRIMARY checkout path and exclusive task ID/slug. Confirm with `git worktree list --porcelain`; do not treat a resumed linked worktree's --show-toplevel as PRIMARY or nest worktrees recursively. Set BRANCH to `task/<task-id>-<slug>` and WT to `$PRIMARY/.worktrees/<task-id>-<slug>` (example: `/home/areion/projects/eterna-take-home/.worktrees/T05-products-api`). Validate task/slug contains only letters, digits and hyphens; reject traversal, symlinks and paths outside PRIMARY/.worktrees. Verify `/.worktrees/` is already ignored in the primary checkout; otherwise pause for coordinator setup, never edit primary .gitignore yourself.

Require no unexplained changes or unfinished Git operations. Fetch origin, verify published baseline and accepted dependency SHAs on origin/main. Inspect local/remote branch existence and registered worktrees. For a NEW assignment require both branch and WT unused, then run with verified variables:

```sh
git -C "$PRIMARY" worktree add -b "$BRANCH" "$WT" origin/main
```

Never use -B/--force, overwrite paths, or borrow another agent's worktree. Creation failure/collision -> pause, not an invented alternate path. On resumption verify assignment, branch/HEAD/path and existing work before reusing your worktree; do not duplicate/reset it. If your previous worktree was cleaned, confirm ownership and retained branch/remote SHAs before `git -C "$PRIMARY" worktree add "$WT" "$BRANCH"`; uncertain state -> pause. Git refs/config/remotes are shared: never modify global/common config, prune worktrees, or remove another agent's Git locks. Serialize administrative operations through coordinator if a Git lock collision occurs.

After creation verify `git -C "$WT" rev-parse --show-toplevel` and branch. Every edit/read path must rebase the canonical prefix to WT; every command must explicitly run there via cwd, `cd "$WT"`, or `git -C "$WT"` (tool terminals may default back to PRIMARY). Record owner/base SHA/branch/WT and IN_PROGRESS in your worktree's card. Install dependencies locally with `pnpm install --frozen-lockfile`; T00 may make its approved manifest/lockfile changes only here. Do not symlink/copy node_modules, .next or generated Prisma from another checkout. Create ignored local env from approved configuration without copying unrelated secrets; keep logs/build output local. Missing prerequisites -> pause. Database/Compose services and ports still require coordinator leases; don't create competing fixed-port stacks or shut down shared services.

## 3. Design tests, then implement

Map acceptance criteria/IDs to tests, including invalid input, ownership and bounds. Write tests first; observe meaningful expected red, implement minimally, green, refactor, rerun. Import/config failure alone is not behavioral red evidence. Foundation tasks stage real tests before schema/features exist; no fake implementations/skipped regressions.

Read installed Next guides before app edits. Edit only graph-owned files plus your card. Shared changes require pause. Use real PostgreSQL/auth for integration; never SQLite/mocked Prisma for atomicity claims. Acquire coordinator postgres-test lease before migration/reset/seed/integration; no lease -> wait; worktrees share DB/ports. Unit tests may run independently. Browser/E2E tooling was removed from this project by user decision (Playwright uninstalled, no `next-e2e` lease exists), so UI work is verified by the owning card's reviewer checklist instead of browser tests; container work (`Dockerfile`, `.dockerignore`, compose `app` service) is authorized for T04 and, where necessary, T08/T09.

## 4. Verify and checkpoint

Run task tests, existing applicable regressions and lint/typecheck/build when prerequisites exist. Planned commands are not evidence. Early cards specify deferred later checks; unexpected unavailable checks block completion. Record red/green commands, exit codes, files/tests, tested implementation SHA, limitations and endpoint notes. Stage only reviewed owned paths/card (not git add .); inspect diff/secrets. Make meaningful incremental commits; final submission must pass available gates.

## 5. Pull latest main, revalidate, then push

Require clean tree/committed work and assigned task branch/origin. Explicit integration: `git -c pull.ff=false -c pull.rebase=false pull --no-rebase --no-edit origin main`. This fetches/merges main without rewriting history. Conflict/failure -> STOP, no automatic recovery.

After integration rerun tests/regressions/applicable lint/typecheck/build. Record integrated origin/main SHA/results. Unexpected regressions -> BLOCKED, not unilateral repairs. Fetch/check before push; if main advanced, repeat integration/verification; repeated churn -> ask coordinator to serialize.

Commit handoff evidence. A final docs-only commit may cite tested parent implementation SHA; state no executable change followed. Push ONLY task branch: `git push -u origin <verified-task-branch>`. Never push main, force or force-with-lease. Rejection/auth/network/divergence -> pause/report. Push success is not acceptance/main integration.

## 6. Hand off, clean your worktree, and stop

Set card REVIEW and commit it before the final push. Record ready-to-push, not a future success. After push, verify `git -C "$WT" ls-remote --exit-code origin "refs/heads/$BRANCH"` returns exactly your local HEAD. Failure/mismatch -> pause and preserve the worktree. Capture the actual pushed SHA and durable handoff in chat/PR outside WT before removing it; keep test evidence in committed card or durable attachments, never solely in disposable logs. Coordinator records acceptance/merge centrally; avoid endless commits recording themselves.

Handoff: ID/status; complete/incomplete deliverables; files; requirements/tests; commands/results/tested SHA; branch/base/integrated-main/pushed SHA; push/PR result; worktree path; uncommitted work; blockers/limits; contract requests; next action; successors eligible only AFTER merge. Report cleanup outcome separately after removal, without editing primary files or recreating the worktree just to update a card.

Remove ONLY your own worktree after ALL gates pass:

1. Required checks passed after latest-main integration, card is REVIEW, every intended change is committed, push succeeded and remote branch SHA equals local HEAD. No unfinished Git operation, blocker or failed push.
2. Confirm the exact registered WT/branch still belongs to you, is the expected nonsymlink child of PRIMARY/.worktrees, and is not PRIMARY or another task's directory. `git -C "$WT" status --porcelain=v1 --untracked-files=all` must be empty. Dirty/untracked content -> preserve and report; no auto-clean/stash/reset.
3. Inspect ignored files with `git -C "$WT" ls-files --others --ignored --exclude-standard`. Git can delete ignored files during normal worktree removal. Remove only when these are your known disposable dependencies/builds/local env and evidence is durable elsewhere. Unknown/valuable artifacts -> preserve and ask. Never print secret contents.
4. Stop only processes you started in WT; release coordinator test/port leases after they stop. Do not tear down shared Compose services. Ensure no active agent/tool process still needs WT. Leave WT as cwd before removal.
5. From PRIMARY, run the guarded operation (no --force):

```sh
cd "$PRIMARY"
git -C "$PRIMARY" worktree remove "$WT"
git -C "$PRIMARY" worktree list --porcelain
```

Confirm WT is absent both from the filesystem and registry; report removed or retained-with-reason. Any refusal -> STOP, never retry with --force, rm -rf, git clean, worktree prune, or automatic unlock. Keep the local AND remote feature branch for review/rework; removal is not branch deletion or acceptance. Reviewer can recreate its own worktree from the retained branch.

On conflicts, failed checks/push, interruption or uncertain ownership, do NOT remove the worktree: preserve partial work and provide a restartable BLOCKED handoff with path/branch/HEAD and process/lease state. Coordinator independently reviews/merges/verifies/marks DONE; workers never mark DONE or start successors automatically.


## 7. Coordinator acceptance and merge (separate authorized role)

Applies only when the user/coordinator explicitly approves a task and authorizes merging/publishing main. Worker task-branch permission is insufficient. Serialize integration; retain both local and remote task branches after merge.

1. Fetch origin; inspect clean status, worktree registry and unfinished Git operations. Verify local main equals origin/main (fast-forward only if safely behind; divergence -> STOP). Pin the approved tip and verify local/remote task refs agree. Review actual diff/card/evidence and applicable tests; a changed tip is not automatically approved. Never rewrite history or resolve conflicts automatically.
2. In the coordinator-controlled main checkout, switch to main and run `git merge --no-ff <approved-task-sha> -m "Merge <task-branch>: <task-id> accepted"`. Use the pinned SHA, not a moving ref. Stop immediately on failure/conflict; never execute a subsequent commit/push in a semicolon chain. Already merged on resumption? Verify ancestry/evidence; do not manufacture another merge.
3. Verify the merged revision with applicable install/tests/lint/typecheck/build, recording exact SHA and results. Coordinator acceptance verification may run in its controlled main checkout; worker primary-checkout restrictions remain unchanged. Serialize generated-output checks; acquire leases before DB/browser operations. Missing future suites are a limitation, not a full-suite pass. Failures block publishing acceptance and successor dispatch; preserve state.
4. Freeze the approved task branch: no post-approval status/evidence commits, amendments, merges back from main, force pushes or deletion. Acceptance may live in the merge message/PR/durable coordinator handoff; a worker's REVIEW/Pending card need not change. If central memory/graph/skill maintenance is requested, make one separate coordinator documentation commit on main citing the tested merge SHA. Do not make a commit merely to record its own SHA or later push result. Never require an extra bookkeeping commit solely to unblock a successor.
5. Fetch/check origin/main again before publishing. Unexpected advancement/divergence -> pause for serialized integration and revalidation, never force-push. With main still based on the verified remote revision, run `git push origin main`. Verify remote main equals local HEAD, approved SHA is an ancestor of origin/main, and both task refs remain at the approved SHA. Failed/rejected push is not acceptance published.
6. Report accepted task, approved tip, tested merge SHA, published main SHA, checks/limitations and retained branch. Successors are eligible only with accepted, verified code published on origin/main; not automatically assigned. Preserve owned verification worktrees on failure; otherwise use section 6's guarded cleanup without branch deletion. Later fixes use a newly authorized task/rework branch, not the frozen historical branch.
