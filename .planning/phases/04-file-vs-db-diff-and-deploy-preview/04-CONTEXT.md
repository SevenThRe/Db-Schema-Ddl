# Phase 4: File-vs-DB Diff and Deploy Preview - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the first full compare workflow between structured file definitions and a live MySQL database. It covers DB-oriented diff presentation, rename review, SQL preview, and dry-run safety boundaries inside the `DB 管理` module. It does not include baseline-vs-live drift as a complete workflow, actual apply-to-DB execution, deployment history, or ER/canvas visualization from Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Diff workspace ownership
- Phase 4 should not reuse the current `SchemaDiffPanel` as the primary experience.
- The compare workflow should live inside `DB 管理` as a dedicated DB-oriented diff workspace.
- The existing file-history diff can remain for legacy flows, but Phase 4 planning should assume a new UI tuned for live DB comparison.

### Primary compare entry
- The extension should support both `sheet`-level and `table`-level comparison.
- The default entry point should be `sheet`-level comparison.
- Users should then be able to drill down into `table`-level differences for detail and SQL review.

### Main workspace structure
- The DB-oriented diff workspace should use a three-column layout.
- Left column: compare scope and object tree, with table-level status badges and filters.
- Middle column: table-level summary and field-level diff details, including rename review.
- Right column: SQL preview with risk summary and highlighted fragments tied to the currently selected diff item.
- A top context strip should keep file, sheet, connection, database, and compare mode visible.

### SQL preview gating
- SQL preview should only generate when there are no blocking items.
- The right column should explain why preview is blocked when risks remain unresolved.
- SQL preview should highlight the parts related to the currently selected table or field diff instead of showing a flat unstructured blob.

### Rename suggestion behavior
- Rename suggestions should be high-confidence only.
- User confirmation is required before SQL preview can proceed.
- The UI should provide a focused “bulk review” step for rename suggestions first.
- Users should still be able to inspect and confirm or reject rename candidates one by one in the detail pane.

### Blocking rules for Phase 4
- `DROP TABLE` must block SQL preview and dry-run continuation.
- `DROP COLUMN` must block SQL preview and dry-run continuation.
- Dangerous type shrink operations must block SQL preview and dry-run continuation.
- Unconfirmed rename suggestions must block SQL preview and dry-run continuation.
- `NULL -> NOT NULL` changes without a default value or fill strategy must block SQL preview and dry-run continuation.

### Baseline-vs-live scope
- The user prefers baseline-vs-live DB comparison to be implemented completely rather than as a partial teaser.
- Therefore, Phase 4 should stay focused on `file / sheet / table vs live DB`.
- Full `baseline snapshot vs live DB` drift detection should be deferred to Phase 5.

### Claude's Discretion
- Exact risk badge wording and severity labels
- Exact SQL highlighting treatment, as long as selected diffs clearly map to SQL fragments
- Exact filters in the object tree, as long as users can quickly isolate changed and blocked items
- Exact visual treatment of the rename review step, as long as bulk review is the default path

</decisions>

<specifics>
## Specific Ideas

- The user feels the current `SchemaDiffPanel` experience is poor and should not shape the new live-DB workflow.
- A better Phase 4 experience is “pick sheet, compare against live DB, inspect table/field diffs, review renames, then preview SQL with meaningful highlighting.”
- Canvas/ER-style visualization may look better eventually, but it is intentionally deferred because safe compare and SQL review matter more in this phase.
- The user values a complete and polished baseline-vs-live workflow, so it should wait until it can be done properly in Phase 5.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/db-management/DbManagementWorkspace.tsx`: already provides the DB module shell where the new compare workspace should live.
- `client/src/hooks/use-db-management.ts`: already establishes a dedicated client data layer for DB-oriented operations and can be extended with compare/dry-run hooks.
- `server/lib/extensions/db-management/schema-normalizer.ts` and `server/lib/extensions/db-management/snapshot-service.ts`: already provide canonical live-schema output and stored snapshots that Phase 4 can compare against file-derived schema models.
- `server/routes/diff-routes.ts` and `server/lib/schema-diff.ts`: already contain request/response and SQL preview ideas from file-history diff work, but should be treated as reusable logic pieces rather than as the target UX.

### Established Patterns
- The project now separates host-level extension lifecycle UX from module-level DB workflows, so compare should stay inside `DB 管理`.
- Shared Zod contracts and typed route declarations remain the expected path for new compare and preview APIs.
- Canonical live-schema output is already separated from `TableInfo`, which means Phase 4 can compare file-derived schema and live DB schema without overloading the Excel parsing model.

### Integration Points
- Phase 4 should likely extend the DB management route group rather than bolting new live-DB compare behavior onto the legacy diff route group.
- The `DB 管理` workspace can grow from its current connection/introspection surface into a mode that includes compare context, object tree navigation, rename review, and SQL preview.
- Existing DDL/ALTER generation logic can be reused selectively, but the surrounding experience should be redesigned around DB comparison rather than historical file diff.

</code_context>

<deferred>
## Deferred Ideas

- Full `baseline snapshot vs live DB` drift workflow
- Actual apply-to-DB execution
- Deployment history and baseline recording UX
- ER / diagram / canvas-based schema visualization

</deferred>

---

*Phase: 04-file-vs-db-diff-and-deploy-preview*
*Context gathered: 2026-03-17*
