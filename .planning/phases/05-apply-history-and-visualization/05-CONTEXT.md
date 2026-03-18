# Phase 5: Apply, History, and Visualization - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase turns the Phase 4 preview workflow into a controlled operational workspace. It covers safe apply execution, DB scan history, snapshot-to-live and snapshot-to-snapshot comparison, and richer schema visualization inside `DB 管理`. It does not expand into direct DB-to-DB comparison or DDL-to-XLSX generation.

</domain>

<decisions>
## Implementation Decisions

### Primary comparison reference
- The main day-to-day reference should be the user-selected xlsx version, not only the most recent successful apply result.
- Users should be able to compare `A.xlsx` or `A-v2.xlsx` against the current live DB and decide whether the document or the DB is newer.
- “Baseline” in this phase should therefore not be modeled only as “last successful deployment state.”

### Automatic snapshot strategy
- DB snapshots should not be manual.
- Each DB scan or refresh should automatically run the diff/hash logic against the latest stored snapshot for the same connection and database.
- A new snapshot version should be created only when the scanned DB schema actually changed.
- If a scan finds no structural change, the system should update recent scan state but should not add a duplicate history version.

### History and drift workflow
- The product should provide a dedicated DB history panel, not just hidden stored snapshots.
- That history view should default to showing what changed relative to the previous changed snapshot.
- Users should also be able to switch comparison targets and compare the current live DB against any stored snapshot.
- `snapshot <=> snapshot` comparison should be supported, not just `live DB <=> snapshot`.

### Apply safety boundary
- Phase 5 apply should execute only safe, automatically executable schema changes.
- High-risk and destructive changes should still be surfaced in diff, history, and SQL review, but should remain blocked from execution in this phase.
- The user explicitly does not want risky changes to become executable merely through a confirmation dialog.

### Apply result presentation
- After apply completes, the user should first see an execution summary.
- From there, they should be able to drill down into per-table and per-SQL execution details.
- Execution results should behave like a traceable job record, not a simple toast-level success/failure message.

### Partial apply behavior
- Users should be allowed to select only some tables from the current safe diff result for execution.
- Tables with blockers should be visibly disabled in the selection UI.
- Blocked tables should clearly display the reason they cannot be applied.

### Visualization scope
- The preferred schema view should render the whole currently selected database graph, not only the changed subset.
- Changed tables should be visually highlighted within that full-database view.
- For larger schemas, users should be able to filter or check only selected tables to render.
- A focused “changed tables plus neighboring relations” slice is acceptable as a filter mode, but not as the only visualization.

### Visualization navigation defaults
- `DB 管理` should offer both diff/history-oriented views and the graph view.
- Initial default should stay on the diff/history list experience.
- Afterward, the product should remember the user’s last active view.

### Claude's Discretion
- Exact labeling for “history,” “snapshot,” and “drift” as long as the workflow is understandable
- Exact execution summary layout, as long as summary-first and drilldown behavior remain intact
- Exact graph filtering controls, as long as full-database view and changed-table highlighting both exist
- Exact wording for blocked-table explanations, as long as users can immediately understand why selection is disabled

</decisions>

<specifics>
## Specific Ideas

- The user often has multiple nearby xlsx revisions and wants to compare each revision against the same live DB to understand whether the DB changed first or the document changed first.
- The user expects DB scan history to work like database management tools: repeated scans build a meaningful version history only when schema actually changes.
- The user prefers richer visualization but does not want Phase 5 to lose the operational diff workflow; graph view should complement, not replace, diff/history panels.
- Safe apply should feel conservative and trustworthy, even if that means some changes stay preview-only.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/lib/extensions/db-management/snapshot-service.ts`: already persists live schema snapshots and is the natural seam for “changed-only” version creation plus history metadata.
- `server/lib/extensions/db-management/db-diff-service.ts`: already contains file-vs-live compare, blocker classification, and SQL preview behavior that can be extended into safe apply and historical compare flows.
- `server/routes/db-management-routes.ts`: already hosts the DB-management route group and should remain the main home for history/apply/visualization APIs.
- `client/src/components/db-management/DbManagementWorkspace.tsx`: already provides the module shell where history, apply, and graph modes should live.
- `client/src/components/db-management/DbDiffWorkspace.tsx`: already establishes a DB-oriented diff UX and can be extended rather than replaced.

### Established Patterns
- Shared Zod contracts and typed route declarations remain the correct path for new history, apply, and graph APIs.
- The project already treats live DB schema as a canonical model separate from `TableInfo`, which supports xlsx-vs-live, live-vs-snapshot, and snapshot-vs-snapshot comparisons without collapsing models together.
- Phase 4 already enforces blocker-aware preview rules, so Phase 5 should build safe execution on top of those same blocker semantics rather than inventing a second safety model.

### Integration Points
- Apply jobs should likely extend the existing DB-management backend services rather than create a separate deployment subsystem.
- Snapshot history and graph visualization should be presented as additional modes inside `DB 管理`, not as separate app-level modules.
- View persistence can likely reuse the same local-state or extension-persistence patterns already used by the current workspace and extension lifecycle surfaces.

</code_context>

<deferred>
## Deferred Ideas

- Direct `DB <=> DB` schema comparison between two live databases
- Pre-stored xlsx templates and future `DDL -> XLSX` generation
- Risky/destructive apply flows guarded only by confirmation dialogs

</deferred>

---

*Phase: 05-apply-history-and-visualization*
*Context gathered: 2026-03-17*
