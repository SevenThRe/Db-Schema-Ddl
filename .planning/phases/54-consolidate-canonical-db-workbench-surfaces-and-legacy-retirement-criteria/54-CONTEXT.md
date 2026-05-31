# Phase 54: Consolidate Canonical DB Workbench Surfaces And Legacy Retirement Criteria - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the current coexistence of canonical and retained DB routes into an explicit surface contract so the product teaches one daily-driver path while still keeping necessary compatibility tools reachable.

This phase delivers:
- one explicit surface inventory that classifies `Database Workspace`, `Connection Center`, and the retained schema/diff paths by product role
- shell-level behavior and copy that reinforce `Database Workspace` as the canonical route
- written retirement criteria and regression handoff for compatibility-only paths

Out of scope in this phase:
- removing retained schema/diff code paths outright
- promoting `Data Sync` or `Job Center` out of preview status
- expanding DB capability scope beyond the current workbench shell

</domain>

<decisions>
## Implementation Decisions

### Canonical Surface Taxonomy
- `Database Workspace` stays the only canonical daily-driver DB route.
- `Connection Center` stays reachable as `Primary Support`, not as a competing workspace mode.
- retained `Schema` and `Diff` paths should be described as compatibility-only tools, not as co-equal product surfaces.

### Shell Behavior
- the shell should render from one explicit surface metadata model instead of scattered ternaries so product role, title, and description do not drift independently.
- compatibility tools should stay reachable behind a secondary affordance with operator-facing explanation of why they still exist.
- if an active connection exists while the operator is in a support or compatibility surface, the shell should offer a clear path back to `Database Workspace`.

### Retirement Criteria
- retained schema/diff paths should name the parity proof and regression checks required before removal.
- the retirement checklist belongs in repo docs so future cleanup is gated by observed truth rather than memory.
- regression coverage should lock the canonical-vs-compatibility wording and the existence of the retirement checklist reference.

### Claude's Discretion
- small UI chrome changes inside `DbConnectorWorkspace.tsx` are acceptable if they reduce ambiguity without removing still-needed paths.
- documentation can be added as the explicit handoff surface for retirement criteria and route ownership.

</decisions>

<specifics>
## Specific Ideas

- replace ad hoc `shellTitle` / `shellDescription` ternaries with one route metadata map
- teach the shell to say `Compatibility tools` instead of implying that retained paths are still first-class
- add one doc that lists route ownership, purpose, and removal criteria in a compact matrix

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and roadmap anchors
- `.planning/ROADMAP.md` — Phase 54 goal, success criteria, and current v2.2 positioning
- `.planning/STATE.md` — current milestone state and queued follow-up framing
- `.planning/REQUIREMENTS.md` — current release-grade requirements baseline that this phase must not silently expand
- `.planning/db-workbench-operator-grade-plan.md` — distilled defect framing for route ambiguity

### Prior decisions and adjacent phase truth
- `.planning/phases/24-canonical-workbench-flow/24-CONTEXT.md` — prior canonical-route decisions that remain binding
- `docs/db-workbench-feature-checklist.md` — current capability and surface maturity labels
- `docs/db-workbench-extension-design.md` — historical design framing that still influences interpretation

### Runtime truth surfaces
- `client/src/components/extensions/DbConnectorWorkspace.tsx` — shell routing, support/canonical copy, and retained schema/diff access
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` — canonical workbench route and manage-connections callback target
- `client/src/pages/Dashboard.tsx` — extension-shell handoff into the DB tool

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - already centralizes the DB shell and contains the current surface status/title/description decisions
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - already exposes the canonical `onManageConnections` callback back to the support surface

### Established Patterns
- the repo already uses compact operator-facing labels such as `Primary`, `Primary Support`, and `Preview`
- route state is already persisted through local storage and query params, so surface labeling changes should avoid changing route ids unless necessary

### Integration Points
- shell product copy and route affordances live in `DbConnectorWorkspace.tsx`
- release and design docs can carry the explicit retirement checklist and surface ownership matrix
- focused text-search tests under `test/client` and `test/server` already lock important product-truth copy

</code_context>

<deferred>
## Deferred Ideas

- physically deleting retained schema/diff code paths belongs to a later parity-closure phase
- any change to `Data Sync` maturity status belongs to Phase 34, not this surface-convergence pass

</deferred>

---

*Phase: 54-consolidate-canonical-db-workbench-surfaces-and-legacy-retirement-criteria*
*Context gathered: 2026-04-18*
