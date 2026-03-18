---
phase: 01-snapshot-compare-and-reports-v1_2
milestone: v1.2
updated: 2026-03-18
research_mode: ecosystem
status: complete
---

# Phase 1 Research

## Research Summary

Phase 1 should be implemented as an **extension of the current DB history and compare stack**, not as a second independent subsystem.

The best approach is:

1. keep the existing `History` tab as the single-DB timeline view
2. add a **new `snapshot-compare` main view** inside `DB 管理`
3. factor current history-compare resolution into a reusable **dual-source compare artifact service**
4. add **task-friendly JSON** and **Markdown report** export off that same artifact

This phase does **not** need a new graph library, a document-generation framework, or a new diff engine.

## Standard Stack

Use the existing stack already proven in `v1.0` and `v1.1`:

- **Backend API/contracts:** `Zod` schemas in [shared/schema.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts) and route registry in [shared/routes.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/routes.ts)
- **Backend services:** existing db-management services in:
  - [history-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/history-service.ts)
  - [graph-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/graph-service.ts)
  - [db-diff-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/db-diff-service.ts)
  - [snapshot-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/snapshot-service.ts)
- **Persistence:** existing SQLite/Drizzle tables already in [shared/schema.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- **Frontend state and transport:** `TanStack Query` hooks in [use-db-management.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/hooks/use-db-management.ts)
- **Frontend UI:** React workspace pattern already used by:
  - [DbHistoryPanel.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/db-management/DbHistoryPanel.tsx)
  - [DbVsDbWorkspace.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/db-management/DbVsDbWorkspace.tsx)
  - [DbManagementWorkspace.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/db-management/DbManagementWorkspace.tsx)
- **Report output:** generate Markdown with a deterministic template function; do **not** add a markdown library in this phase

### Prescriptive choice

Use:

- **Zod + typed route contracts** for all new compare/export APIs
- **plain TypeScript serializer functions** for Markdown report generation
- **the existing compare result shape as the base**, then extend it into a stable snapshot-compare artifact

Do **not** add:

- a separate reporting framework
- a second compare engine
- a new persistence store

## Architecture Patterns

### 1. Promote “history compare” into a reusable dual-source compare artifact

Today the history path is partially special-cased:

- [dbHistoryCompareRequestSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [dbHistoryCompareResponseSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [compareDbHistory()](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/history-service.ts)

The next step should be:

- keep `DbHistoryCompareSource` as the source selector vocabulary
- generalize compare resolution so left/right sources can come from arbitrary histories
- produce one **stable compare artifact** that both UI and exports consume

This artifact should be richer than the current UI tree:

- stable source descriptors
- stable entity keys
- summary
- table changes
- column changes
- blockers
- metadata for exported reports

### 2. Split timeline browsing from arbitrary compare

Keep:

- `History` = timeline, scan event list, selected event details

Add:

- `Snapshot Compare` = arbitrary left/right source selection and compare execution

This matches the earlier `db-vs-db` design choice from `v1.1`, where complex comparison logic moved into its own dedicated workspace.

### 3. Resolve sources first, compare second, render/export last

The right backend shape is:

1. **source resolution**
   - live
   - snapshot
   - later possible exported report re-import
2. **artifact compare**
   - convert both sides into canonical catalogs
   - compare through one stable artifact builder
3. **consumer outputs**
   - UI summary/tree/detail
   - Markdown report
   - task-friendly JSON
   - graph highlighting later if needed

This keeps export/report logic from drifting away from the actual compare logic.

### 4. Report export should be a pure projection of the artifact

Do not build report export by walking UI state.

Instead:

- derive Markdown from the compare artifact
- derive JSON from the compare artifact

This is the key AI/MCP-friendly decision for this phase.

## Don't Hand-Roll

### 1. Don’t build a second diff model just for reports

The app already has:

- `DbDiffSummary`
- `DbDiffTableChange`
- `DbDiffColumnChange`
- blocker and rename structures

Use those as the base and extend carefully for snapshot-compare needs.

Do **not** create:

- a special “report-only” tree
- a separate “history-only” compare schema unrelated to existing DB compare schemas

### 2. Don’t hand-roll unstable JSON for AI/MCP

The JSON output should be schema-backed and versionable from day one.

Use:

- new Zod schemas in [shared/schema.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)

Do **not** return:

- ad-hoc nested objects that are only convenient for the first UI pass
- label-only structures without stable keys

### 3. Don’t force live refresh on every compare

The existing system already treats snapshots as first-class persisted state.

Use:

- explicit `refreshLive` / `use latest snapshot` controls

Do **not**:

- silently rescan on every compare
- let UI choice and backend freshness behavior drift apart

### 4. Don’t add a markdown/rendering dependency for Phase 1

This phase only needs deterministic handoff documents:

- summary
- source/target metadata
- table detail
- column detail

Use a plain TypeScript template serializer.

Adding a markdown framework here would increase complexity without solving a real current problem.

### 5. Don’t keep cross-connection history compare blocked in the service layer

Current code still contains this blocker in [history-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/history-service.ts):

- `Cross-connection history comparison is not supported in this phase.`

Phase 1 exists specifically to remove that limitation for snapshot comparison.

## Common Pitfalls

### 1. Confusing “live” with “fresh”

Current history compare already allows `kind: "live"` with optional snapshot reuse.
The pitfall is letting the UI say “live” while the backend silently uses stale state.

Plan verification should check:

- source context explicitly reports whether it used a refreshed live read or a stored snapshot
- exported Markdown/JSON also records that choice

### 2. Reusing the route shape that assumes one connection ID in the URL

Current history routes are scoped as:

- `/api/db-management/connections/:id/history`
- `/api/db-management/connections/:id/history/compare`

That shape is awkward for arbitrary cross-connection snapshot compare.

Research conclusion:

- keep single-connection timeline routes as-is
- add a **new compare/report route family** not keyed by one connection id in the URL

### 3. Letting exported reports depend on the current UI filter state accidentally

The report should clearly separate:

- comparison artifact truth
- optional view filters

If filters are allowed in export, they should be explicit export options, not accidental coupling to whatever table is selected in the UI.

### 4. Losing stable IDs when converting snapshot/live/file sources into one compare response

This is the main MCP risk.

Verification should check that:

- every source has a stable descriptor
- every table/column change has a stable entity key
- table and column detail can be re-addressed after export/import of JSON

### 5. Mixing timeline detail and compare workspace too early

The current `DbHistoryPanel` already tries to do:

- timeline
- compare presets
- selected event details

If Phase 1 keeps piling onto that component, the UX will regress.

Research conclusion:

- extract reusable logic
- do not keep piling major compare behavior into the existing history component

## Code Examples

### Existing source vocabulary to keep

Use the current `DbHistoryCompareSource` family as the source language:

- `file`
- `live`
- `snapshot`

Reference:
- [dbHistoryCompareSourceSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)

### Existing dual-source pattern to imitate

For the new workspace, follow the `db-vs-db` pattern:

- compare input
- compare response
- graph response
- dedicated workspace state

References:
- [dbVsDbCompareRequestSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [dbVsDbCompareResponseSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [dbVsDbWorkspaceStateSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [DbVsDbWorkspace.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/db-management/DbVsDbWorkspace.tsx)

### Existing history artifacts to extend rather than replace

References:

- [dbHistoryEntrySchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [dbHistoryListResponseSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [dbHistoryCompareResponseSchema](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
- [compareDbHistory()](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/extensions/db-management/history-service.ts)

### Existing frontend hook pattern to follow

Keep the current `useMutation/useQuery` pattern in:

- [use-db-management.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/hooks/use-db-management.ts)

Add:

- one query/mutation set for snapshot-compare execution
- one export mutation for Markdown/JSON reports

Do not introduce a separate client-side data layer.

## Recommended Plan Shape

The planner should likely split this phase into work resembling:

1. **Contracts and artifact model**
   - new schemas for snapshot-compare artifact and report export
2. **Backend compare/report service**
   - cross-connection source resolution
   - artifact builder
   - Markdown/JSON export
3. **New `Snapshot Compare` workspace**
   - dual-source selectors
   - freshness controls
   - result/detail/export UI
4. **History panel simplification/integration**
   - keep timeline role clear
   - link into snapshot-compare workspace instead of overloading current panel

## Confidence

- **High confidence**: reuse of current contracts, services, and workspace patterns
- **High confidence**: no new library is needed for report export
- **Medium confidence**: exact final artifact schema shape, because it needs to serve UI, reports, and MCP cleanly without overfitting to one consumer
