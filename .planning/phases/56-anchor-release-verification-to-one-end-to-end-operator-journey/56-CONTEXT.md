# Phase 56: Anchor Release Verification To One End-To-End Operator Journey - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Tie release confidence back to one real DB workbench operator journey so preflight, release docs, and gate tests validate the modern extension-shell route instead of stale standalone assumptions.

This phase delivers:
- one written operator-journey contract for release verification
- updated preflight checks that validate the current extension-shell verification seam
- release docs and tests that map evidence back to the same connection -> inspect -> query -> edit/apply -> audit journey

Out of scope in this phase:
- producing fresh external live DB evidence on this machine
- changing ship-gate artifact schemas unless needed for the journey contract
- promoting preview workflows that still lack runtime proof

</domain>

<decisions>
## Implementation Decisions

### Journey Contract
- the canonical journey is `Connection Center -> Database Workspace -> inspection/query -> guarded edit or apply preview -> audit or job review`.
- release docs should describe evidence collection by journey stage, not as a disconnected list of feature names.
- the journey must remain anchored to the current extension-shell route, not an old direct dashboard-to-panel assumption.

### Preflight Truth
- desktop preflight should verify that Dashboard still resolves the official DB connector activity through the extension shell and can auto-open it for verification.
- preflight should continue to verify workspace checkpoint emitters from `DbConnectorWorkspace.tsx`.
- the preflight check should fail when the extension-shell handoff or checkpoint emitters drift, not because a removed hardcoded string disappeared.

### Blocker Classification
- release docs should keep explicit blocker language when live DB proof is still missing.
- the journey contract should say which stages are currently static-only, packaged-smoke-backed, or live-verification-backed.

### Claude's Discretion
- new docs or focused contract notes are acceptable when they reduce ambiguity around the release-verification seam.
- preflight/test changes should stay narrow and should not invent a generic verification framework.

</decisions>

<specifics>
## Specific Ideas

- add one `docs/db-workbench-operator-journey.md` file and reference it from release docs
- update `script/desktop-preflight.ts` so `frontend-smoke-entry` keys off `OFFICIAL_EXTENSIONS.DB_CONNECTOR`, `autoOpenDbWorkbench`, `ExtensionWorkspaceHost`, and workspace checkpoints
- update gate tests so they assert the modern extension-shell seam rather than a removed literal

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Release and gate docs
- `docs/release-candidate-verification.md`
- `docs/release-exit-checklist.md`
- `.specify/specs/020-db-workbench-productization/contracts/runtime-reliability-gates.md`

### Runtime verification seam
- `script/desktop-preflight.ts`
- `client/src/pages/Dashboard.tsx`
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/lib/release-verification.ts`
- `shared/release-verification.ts`

### Existing regression coverage
- `test/server/db-workbench-release-gates-phase24.test.ts`
- `test/server/release-verification-phase26.test.ts`
- `test/client/db-workbench-live-bootstrap-phase32.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/pages/Dashboard.tsx`
  - already reads release verification config and auto-opens the preferred DB extension through the extension shell
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - already emits `db_workbench_surface_ready` and `db_workbench_recovery_classified`
- `script/desktop-preflight.ts`
  - already centralizes release-verification seam checks and is the right narrow place to fix the outdated assumption

### Established Patterns
- release-gate tests in `test/server` use source-level assertions to lock the verification seam
- release docs already describe evidence classes and blocker states; this phase should tighten cohesion, not add a second gate system

### Integration Points
- preflight and gate tests should consume the same extension-shell journey assumptions
- the operator-journey doc should be referenced from both release docs and the reliability contract

</code_context>

<deferred>
## Deferred Ideas

- capturing passing MySQL/PostgreSQL live artifacts remains external follow-through after this phase
- broadening the release journey to include preview-only sync execution belongs to a later maturity phase

</deferred>

---

*Phase: 56-anchor-release-verification-to-one-end-to-end-operator-journey*
*Context gathered: 2026-04-18*
