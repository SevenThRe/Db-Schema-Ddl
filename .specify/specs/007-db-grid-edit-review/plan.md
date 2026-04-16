# Plan: Grid Edit Review And Revert UX

## Summary

This wave builds on 006 by improving review ergonomics instead of expanding backend scope. The implementation stays inside the React workbench surface, deriving row summaries directly from `pendingEditCells`.

## Scope

- Add a reusable frontend helper for pending-edit row summaries.
- Add selected-row inspector revert actions for dirty fields.
- Add compact pending-row summary cards in the result grid with row-level revert.
- Add row-level before/after summaries to the commit confirmation dialog.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/GridEditCommitDialog.tsx`
- `client/src/components/extensions/db-workbench/grid-edit-summary.ts`

## Risks

- Revert actions must always invalidate any prepared commit plan so commit preview cannot go stale.
- Row summaries must stay deterministic across repeated edits to the same row.
- Additional review UI must preserve the workbench’s dense, pane-oriented layout rather than expanding into card-heavy presentation.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop verification later: stage multiple edits, revert one field, revert one row, inspect commit dialog summaries
