---
name: review-task-card
description: Explain a StockFlow task implementation for a reviewer like a senior developer mentoring a junior with slight domain knowledge. Use for requests such as explain your implementation, walk me through T01, or explain a task before review. Ground the thorough walkthrough in actual code, task requirements, and recorded test evidence; do not approve or merge.
compatibility: Requires repository read access and Git for revision inspection. Other agents may read this skill explicitly if skill discovery is unavailable. No installs or test execution by default.
---

# Review a task through an implementation explanation

Companion to `/home/areion/projects/eterna-take-home/.cline/skills/implement-task-card/SKILL.md`. The implementation skill produces code and a REVIEW handoff; this skill helps the reviewer understand that work before independent acceptance. It is an explanation, not a substitute for a correctness audit or coordinator verification.

## Mandatory boundaries

Read-only by default, including in Plan mode. Do not edit files, change task status, fetch or switch branches, create/remove worktrees, install dependencies, execute application tests, commit, push, approve, or merge. Never modify a retained approved task branch. Do not expose secrets. Explain observed problems without repairing them. REVIEW is not DONE; historical Pending card text does not override durable coordinator acceptance evidence.

## 1. Resolve the request

Support conversational requests such as:
- "Please explain your implementation." Use the uniquely identified task in the current conversation; do not assume the current checkout is the intended task.
- "Use review-task-card to explain T01 like a senior developer teaching a junior."
- "Walk me through the implementation on task/T02-contracts."

Accept a task ID and optional branch, commit SHA, or focus area as context. Normalize numeric aliases against the graph (T001 -> T01); require a unique existing task. With no explicit target, use an unambiguous current handoff. Otherwise ask one focused question identifying candidate tasks; do not guess based on the latest commit or stale status labels.

Invocation is host-dependent: the skill name is `review-task-card`. A host exposing skills as slash commands may support `/review-task-card T01`; verify its discovery/help before promising that syntax. `/explain T01` is only a proposed convenience alias, not registered by this file. Deterministic fallback: explicitly ask the agent to read this absolute SKILL.md path and follow it for T01. Neither slash syntax nor natural language is a shell command or a new implementation assignment.

The same evidence requirements apply whether the agent implemented the task or is reviewing it fresh. Do not rely on conversational memory as proof or claim authorship of another agent's decisions.

## 2. Pin the evidence and inspect the code

Read AGENTS.md, all six core memory-bank documents, the companion implementation skill, the dependency graph and guide, the selected task card, and relevant implementation-plan headings. Canonical root: `/home/areion/projects/eterna-take-home`. Resolve the actual repository/worktree root and use absolute paths; do not borrow or mutate another worker's checkout.

Inspect status and the worktree registry read-only. Resolve the requested ref to an immutable commit SHA. Read the card and changed files at that SHA using `git -C <absolute-root> show <sha>:<repo-relative-path>` rather than assuming working files match. Record target SHA, comparison base, task branch, and acceptance state. Local remote-tracking refs may be stale; label freshness unknown unless checked read-only with `git ls-remote` or supported by durable evidence. Remote-only missing objects require coordinated retrieval, not invented contents.

Prefer the card's recorded integrated-main SHA as comparison base after verifying it is an ancestor of the target; otherwise use a verified recorded base and disclose possible upstream changes. Inspect diff, commit history, full relevant source, tests, and directly involved unchanged dependencies. Separate task changes from upstream integration; do not blindly diff against today's main after acceptance. Cite absolute file paths, symbols and line ranges at the pinned revision, not mismatched current-checkout lines.

Missing or ambiguous revisions block a definitive walkthrough. Report concrete missing evidence and request clarification. Code/card discrepancies become clearly labeled review questions; explain the verifiable portions without inventing reconciliation. Planned behavior is not implemented behavior.

## 3. Explain like a senior teaching a junior

Be complete and thorough, not a terse changelog. Assume basic programming knowledge but only slight domain knowledge. Define unfamiliar project/framework terms briefly on first use. Explain context before detail, why alongside how, and use small concrete examples. Do not dump every line or invent rejected alternatives or author intent; label inferred rationale.

Use these sections:

1. **Summary and review target** — plain-language outcome, task ID, branch, pinned SHA/base, and evidence limitations.
2. **Requirements and scope** — promised deliverables, requirement IDs, dependencies, completed/deferred work, and what this task deliberately does not implement.
3. **Architecture and mental model** — components, responsibilities, boundaries, and a simple flow showing how this change fits existing code.
4. **Implementation walkthrough** — explain each substantive changed file or coherent group, key functions/types/configuration, interactions, design rationale and tradeoffs. Include a concrete end-to-end happy path with inputs, state changes and outputs; for tooling, trace a command instead of inventing a user/API flow.
5. **Correctness, edge cases and security** — trace relevant failure paths and the concrete bugs prevented. Cover applicable validation, ownership, precision, transactions, concurrency, cleanup and error handling. Mark unrelated topics not applicable rather than implying this task implements them.
6. **Tests and evidence** — map requirements to actual test files/cases; explain setup, action, assertions and what each proves. Distinguish recorded worker results from independently executed checks. Cite commands, outcomes and tested SHA where available; missing red/green history is unknown, not fabricated. Unit mocks do not prove PostgreSQL atomicity. Deferred or unavailable suites are not passes.
7. **Limitations and reviewer checkpoints** — remaining risks, code/evidence discrepancies, missing coverage, successor contracts, and specific questions/checks before acceptance.

Use illustrative inputs rather than claiming examples were executed. Scale depth to the task while covering every substantive deliverable. End with a short recap the junior could explain back.

## 4. Verification and handoff

Deliver the explanation in chat; do not write a report unless separately authorized. Check that claims and citations match the pinned revision and that no planned feature is presented as delivered. State whether any live checks were run: this skill alone runs none.

If live verification is requested, treat it as a separately authorized step in a reviewer-owned isolated worktree, never application installs/tests in primary or a worker's checkout. Obtain coordinator ownership and shared database/port leases before applicable operations; follow the implementation skill's lifecycle and conflict-stop gates. Preserve state on failures. Do not infer approval or merge authorization from a request to explain or test.

Route proposed fixes and central documentation updates to the coordinator. Accepted branches remain frozen; fixes require a newly authorized rework branch. Do not mark DONE or dispatch successors.
