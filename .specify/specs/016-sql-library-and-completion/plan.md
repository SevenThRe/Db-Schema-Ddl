# Plan: SQL Library And Completion

## Summary

This wave upgrades the SQL editor's daily productivity loop without changing backend execution semantics. The toolbar's low-density snippet/history selects will be replaced by a searchable SQL library dialog backed by the existing connection-scoped session store, and the autocomplete engine will grow keyword/template suggestions plus better context-aware ranking around the active table and SQL clause.

## Scope

- Replace separate snippet/history selects with a unified SQL library entry point.
- Add preview and actions for library entries: replace active tab SQL, open in a new tab, and delete saved snippets.
- Extend session helpers with snippet deletion while preserving connection-scoped storage behavior.
- Upgrade autocomplete with keyword/template suggestions and context-aware ranking that favors the selected table and clause-specific relation/column suggestions.
- Keep existing query execution, snippet save flow, and session persistence intact.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/workbench-session.ts`
- `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/SaveSnippetDialog.tsx`
- `client/src/components/ui/dialog.tsx`
- `client/src/components/ui/scroll-area.tsx`
- `test/client/db-workbench-session-phase16.test.ts`
- `test/client/db-workbench-sql-library-phase16.test.ts`

## Risks

- The SQL library must stay dense and operator-oriented rather than turning into a consumer-style modal.
- Replacing the old selects must not regress quick snippet insertion or recent query reuse.
- Autocomplete ranking should improve relevance without hiding schema objects operators expect to see.

## Verification

- `npm run check`
- `node --test --experimental-strip-types test/client/db-workbench-session-phase16.test.ts test/client/db-workbench-sql-library-phase16.test.ts`
- Manual desktop check: open SQL library, preview a recent query, replace active tab SQL, open a snippet in a new tab, delete a snippet, and confirm autocomplete shows keyword/template entries plus selected-table-biased suggestions.
