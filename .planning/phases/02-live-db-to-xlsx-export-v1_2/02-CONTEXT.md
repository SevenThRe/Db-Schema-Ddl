# Phase 2: Live DB to XLSX Export - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds direct `live DB -> XLSX` export on top of the shipped DB canonical model and the trusted workbook-template system.

It covers:

- exporting a selected live MySQL database into one of the official parser-compatible workbook templates
- choosing whole-database or filtered-table export scope
- reusing the same trust model as existing workbook creation and DDL-driven workbook export
- validating generated workbooks through parser-backed round-trip before they are treated as trusted

It does **not** cover:

- Oracle live DB export
- exporting non-table DB objects
- arbitrary user-defined workbook formats
- expanding reverse import inputs beyond the already planned Phase 3 work

</domain>

<decisions>
## Implementation Decisions

### Entry Point and Workspace Placement
- `live DB -> XLSX` should be a **new main view inside `DB 管理`**, not a hidden action inside `History`, `Snapshot Compare`, or `关系图`.
- This follows the same product rule already used for `DB vs DB` and `Snapshot Compare`: when a workflow has its own trust gates, scope controls, and review surface, it gets a dedicated workspace.
- Future contextual jumps from other DB views are allowed, but the primary home is the dedicated export view.

### Live Freshness Behavior
- Export should **not** force a live refresh every time by default.
- The workspace must provide an explicit freshness control:
  - `使用最近 snapshot`
  - `导出前刷新 live`
- Recommended default: `使用最近 snapshot`

Rationale:
- This stays consistent with the `Snapshot Compare` freshness model from Phase 1.
- Users can choose speed vs latest-live correctness intentionally rather than paying refresh cost every time.

### Export Scope Model
- The export workflow should start from the **whole currently selected database catalog**, not from an entry-time table picker.
- Once the catalog is loaded, users can:
  - export all tables
  - export only selected tables
- The UI should support filtering and selecting tables before the actual workbook export action.

Rationale:
- This preserves whole-database visibility first, then allows focused export.
- It matches the milestone requirement for whole-database and filtered-table export without making the entry flow heavy.

### Trust Model and Lossy / Blocking Rules
- Phase 2 must reuse the same conservative trust posture already established in the DDL-driven workbook export flow.
- Export should be treated as **blocking** when the live DB schema contains constructs that cannot be safely represented in the official workbook contract.
- Export may continue only with explicit confirmation for **lossy but reviewable** constructs.
- After workbook generation, parser-backed round-trip validation remains a **hard blocker**.

Recommended severity split:

- **Blocking**
  - generated / computed columns
  - CHECK constraints
  - partitioning clauses or equivalent unsupported table structures
  - any construct that makes workbook round-trip fail
  - any situation where the chosen official template cannot represent the selected result safely enough for the parser to reopen it

- **Confirm / lossy**
  - table comments
  - column default values
  - column-level UNIQUE intent when not structurally preserved
  - secondary indexes
  - foreign keys
  - engine / collation / other DB metadata that is informational but not structurally preserved in the workbook contract

- **Informational**
  - metadata that is intentionally not modeled but should still be surfaced in issue summaries or comments when useful

### Template Choice and Output Ownership
- Export should target the **same two official workbook template families** already shipped in the product.
- The user should choose the template family in the export workspace.
- The product may remember the last selected template and use it as the default next time.
- The result should be a real `.xlsx` workbook that is registered into the normal file list and can be opened immediately in the existing file-driven workflow.

### AI / MCP-Friendly Export Artifact
- The export review result should not be a UI-only structure.
- Phase 2 should produce a stable machine-readable export artifact that includes:
  - source connection/database
  - selected freshness mode
  - resolved snapshot hash used for export
  - selected table set
  - chosen template id
  - issue summary
  - blocking / lossy details
  - output file metadata after successful creation

Rationale:
- The product is expected to keep growing more MCP / agent behaviors.
- Export flows should remain automatable and auditable, not just clickable.

### Claude's Discretion
- Planner and researcher can decide the exact export workspace layout, as long as it remains a dedicated `DB 管理` main view and keeps freshness, selection, issue review, and export action clearly visible.
- Planner and researcher can decide whether the export pipeline reuses existing DDL export helpers directly or introduces a DB-catalog-specific export adapter, as long as the official template and round-trip trust model stay unified.
- Planner and researcher can decide the exact issue serializer shape, as long as blockers vs lossy confirmation remains explicit and machine-usable.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/lib/workbook-templates.ts`
  Already provides the official workbook template family and parser-backed trust validation.
- `server/routes/files-routes.ts`
  Already defines how generated workbooks become real registered files in the app.
- `server/lib/ddl-import/export-service.ts`
  Already exports canonical table catalogs into official workbook templates and performs parser-backed round-trip validation.
- `server/lib/ddl-import/issues.ts`
  Already codifies a useful blocker / confirm / info trust model for workbook export.
- `server/lib/extensions/db-management/schema-normalizer.ts`
  Already produces the canonical DB schema shape from live MySQL introspection.
- `server/lib/extensions/db-management/history-service.ts`
  Already resolves live vs snapshot freshness and produces stable compare artifacts; its freshness pattern should be mirrored here.
- `client/src/components/db-management/DbManagementWorkspace.tsx`
  Already hosts multiple dedicated DB-management views; this is the correct integration point for a new export workspace.
- `client/src/components/db-management/DbSchemaGraph.tsx`
  Already shows whole-database-first selection patterns that can inform Phase 2's table-scope UX.

### Established Patterns
- Complex DB workflows get their own dedicated main view inside `DB 管理`.
- Parser-backed round-trip is the trust boundary for workbook creation/export.
- Generated `.xlsx` outputs should re-enter the normal file list rather than forcing download + re-import.
- The product already remembers user template preference in the DDL-driven export flow; Phase 2 can reuse that memory pattern.

### Integration Points
- Add a new `DB 管理` main view for live DB workbook export.
- Reuse current selected connection/database context as the default source.
- Reuse official template metadata and parser-backed validation from workbook template services.
- Reuse uploaded-file registration path so exported workbooks join the normal file workflow immediately.
- Reuse or parallel the DDL workbook-export trust model for blocker / confirm / info issue handling.

</code_context>

<specifics>
## Specific Defaults Chosen

- Because the user explicitly accepted recommendation-driven defaults, this context uses the recommended options without further branching:
  - dedicated export workspace inside `DB 管理`
  - explicit freshness toggle with default `使用最近 snapshot`
  - whole-database-first load, then selection before export
  - conservative blocker / lossy trust model based on existing workbook export rules

</specifics>

<deferred>
## Deferred Ideas

- Oracle live DB export belongs to a later phase
- exporting views / triggers / procedures remains out of scope
- report publishing or richer artifact sharing can be layered later
- direct export from graph-only selection or history-only quick action can be added later as convenience shortcuts

</deferred>

---

*Phase: 02-live-db-to-xlsx-export-v1_2*
*Context gathered: 2026-03-18*
