# System Patterns

Planned architecture, not implemented: thin Node.js Route Handlers -> authenticated owner-scoped services -> Prisma/PostgreSQL. Server pages independently validate sessions; client forms receive DTOs and use explicit REST endpoints. Keep existing @/* imports. No root proxy required and layout alone is not authorization.

BetterAuth server API behind explicit register/login/logout/session wrappers. bcryptjs cost 12, password byte limit, DB sessions, no cookie cache, fixed expiry, real revocation, origin protection. Forward cookies separately, never expose raw session tokens/hashes. Predictable JSON errors and field paths.

Integer cents; bounded half-up basis-point tax snapshotted per invoice. Drafts validate but do not reserve stock. Serializable bounded-retry transactions, guarded status/version and quantity updates, sorted product writes. Soft-deletion preserves invoices and reserves SKU. Existing draft lines retain snapshots; new lines snapshot current product data. Product versions prevent stale manual stock overwrite.

TDD: real PostgreSQL handler integration tests plus pure unit and focused browser tests; no mock-only atomicity claims. See plan for model/contracts and 36-ID traceability.

Execution: canonical DAG/card ownership prevents unordered shared-file writes; T06->T07 serializes invoice service. Database/E2E leases serialize shared DB resets/ports across isolated worktrees. T01/T02 have no mutual imports; T03 integrates contracts. Tests split by auth/products/invoice drafts/lifecycle/browser family. Worker updates own card only; coordinator maintains central memory/graph and accepts merged tasks. No autonomous conflict resolution; agent-created feature worktree/branch -> tests -> implementation -> latest-main merge -> revalidation -> task-branch push -> durable REVIEW handoff -> guarded own-worktree removal. Never edit/test in primary; keep feature branches for review. Inspect ignored artifacts before non-forced removal; preserve worktrees on blockers and uncertain state. Shared Git metadata/locks require coordination despite filesystem isolation.
