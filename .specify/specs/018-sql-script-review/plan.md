# Plan: SQL Script Review

## Summary

This wave turns multi-statement execution into a first-class operator workflow. A lightweight client-side SQL statement splitter/classifier will support a pre-run script review dialog, `SqlEditorPane` will expose an explicit `Run script` action, and `ResultGridPane` will summarize script outcomes while preserving existing batch tabs and execution safety seams.

## Scope

- Add a client-side SQL statement splitter/classifier that ignores comments and quoted strings.
- Add a `Run script` toolbar action to the SQL editor.
- Add a script review dialog that lists the statements about to run and explains current stop-on-error behavior.
- Add a compact multi-statement summary strip in the result grid.
- Reuse the existing parameter review, dangerous SQL preview, and query execution flow.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/sql-statements.ts`
- `client/src/components/extensions/db-workbench/SqlScriptReviewDialog.tsx`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `test/client/db-workbench-sql-script-review-phase18.test.ts`

## Risks

- Statement splitting should stay close to backend behavior enough that review counts match execution counts in normal scripts.
- The script review dialog must remain dense and tool-like rather than bloated.
- Result summaries must add clarity without crowding the existing result grid controls.

## Verification

- `npm run check`
- `node --test --experimental-strip-types test/client/db-workbench-sql-script-review-phase18.test.ts`
- Manual desktop check: run a multi-statement script from the toolbar, confirm the review dialog, then inspect the result summary and batch tabs.
