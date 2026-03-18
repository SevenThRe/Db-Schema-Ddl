# Phase 1: Cross-Database Compare - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds direct `DB vs DB` comparison inside `DB 管理`.

It covers:

- choosing a source DB and a target DB
- comparing two live DB schema targets directly
- reviewing directional differences from `source -> target`
- previewing what would need to change in the target to match the source
- visualizing those differences in the existing DB-oriented workspace and graph tooling

It does **not** cover:

- cross-environment apply or sync
- template workflows
- `DDL -> XLSX`
- broader reverse-authoring features

</domain>

<decisions>
## Implementation Decisions

### Source / Target Selection
- The compare flow must support two arbitrary saved targets.
- The two targets may be:
  - different saved connections
  - the same connection with different databases
- The UI must provide a one-click `swap source / target` action.

### Compare Scope
- The initial compare runs at whole-database scope by default.
- Users should not be forced to preselect tables before running compare.
- After compare completes, users can filter and focus on specific tables in the results.

### Workspace Structure
- `DB vs DB` should appear as a new main view inside `DB 管理`, not be merged invisibly into the existing `file vs DB` flow.
- Entering that view should open a dedicated workspace specialized for cross-database comparison.
- The dedicated workspace should combine:
  - a diff tree / object list
  - directional SQL or DDL-style preview for `source -> target`
  - graph-view highlight linkage

### Directional Preview
- The result experience must be more than a raw diff summary.
- Users need to see both:
  - what is different between source and target
  - what the target would need to change to converge toward the source
- Directional preview remains preview-only in this milestone and must not imply executable cross-environment sync.

### Rename / Equivalence Policy
- Rename and equivalence handling should follow a permission-style model similar to AI CLI approval policies.
- The default policy is conservative:
  - suggestions are shown
  - high-confidence suggestions still require confirmation by default
- Users should be able to relax this in settings.
- The first-cut settings model should stay low-complexity:
  - separate thresholds by object type
  - `table rename auto-accept threshold`
  - `column rename auto-accept threshold`
- If no threshold is configured, manual confirmation remains required.

### Claude's Discretion
- Planner and researcher can decide the exact panel geometry and control placement, as long as the dedicated `DB vs DB` workspace remains clearly separate from `file vs DB`.
- Planner and researcher can decide whether the directional preview is presented as SQL snippets, DDL-style grouped artifacts, or a hybrid, as long as it stays understandable as `source -> target`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/db-management/DbManagementWorkspace.tsx`
  Existing multi-view DB management shell with tabs and remembered active view behavior.
- `client/src/components/db-management/DbDiffWorkspace.tsx`
  Existing DB-oriented diff tree/detail/preview workspace that can inform the new `DB vs DB` compare surface.
- `client/src/components/db-management/DbHistoryPanel.tsx`
  Already supports compare-source switching across `file`, `live`, and `snapshot`, which is a strong seam for cross-database compare inputs.
- `client/src/components/db-management/DbSchemaGraph.tsx`
  Already renders full-database graph visualization with changed-table highlighting and focus modes.
- `server/lib/extensions/db-management/history-service.ts`
  Already resolves compare sources and performs cross-source comparisons for `file`, `live`, and `snapshot`.
- `server/lib/extensions/db-management/db-diff-service.ts`
  Already contains canonical compare, blocker, rename, and preview logic for DB-oriented diffing.
- `server/lib/extensions/db-management/graph-service.ts`
  Already derives graph DTOs from canonical schema plus compare results.
- `server/routes/db-management-routes.ts`
  Already exposes typed DB-management route patterns for compare, preview, history, apply, and graph data.

### Established Patterns
- Shared Zod contracts live in `shared/schema.ts` and route definitions in `shared/routes.ts`.
- `DB 管理` already uses a dedicated workspace model rather than reusing the legacy file diff screen.
- Preview and apply behavior is intentionally conservative and blocker-aware.
- The graph is treated as a first-class view, not a decorative add-on.

### Integration Points
- Add a new `DB vs DB` main view within `DB 管理`.
- Extend the shared compare-source contracts to support `live vs live` safely for this phase.
- Add new typed routes/hooks for cross-database compare and directional preview.
- Reuse graph highlighting by feeding it `source vs target` compare results instead of `file vs DB` only.
- Add rename/equivalence policy controls in settings or an equivalent low-friction configuration surface.

</code_context>

<specifics>
## Specific Ideas

- The user wants this to feel operationally complete, not like a half-step compare mode.
- The expected result is a combined experience:
  - tree of differences
  - directional preview
  - graph-linked highlighting
- The user prefers low-learning-cost configuration and explicitly compared the rename policy idea to AI CLI permission settings.
- The preferred first-cut configurability is by object type plus confidence threshold, not by many nested scope dimensions.

</specifics>

<deferred>
## Deferred Ideas

- Cross-environment `DB -> DB` apply or sync remains out of scope for this phase and this milestone.
- Cross-environment compare against stored snapshots from different DB environments is already noted as future requirement `DBDB-05`.
- Exportable compare reports / handoff artifacts are already noted as future requirement `DBDB-06`.
- Template-led authoring and `DDL -> XLSX` belong to later `v1.1` phases, not this one.

</deferred>

---

*Phase: 01-cross-database-compare-v1_1*
*Context gathered: 2026-03-18*
