# Plan: Grid Row Delete

## Summary

This wave extends the existing grid edit workflow from update-only into update-plus-delete. It keeps the same prepare/commit mental model, adds delete drafts in the frontend, and generalizes the backend prepared plan system to support `DELETE` statements alongside `UPDATE`.

## Scope

- Extend shared grid edit contracts with staged row delete payloads.
- Generalize `grid_edit.rs` prepared statement handling to support delete mutations.
- Add row delete draft state, revert actions, and visual treatment in `ResultGridPane` / `WorkbenchLayout`.
- Extend the commit review dialog so deletes are visible before execution.

## Likely Touchpoints

- `shared/schema.ts`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/GridEditCommitDialog.tsx`
- `client/src/components/extensions/db-workbench/grid-edit-summary.ts`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/grid_edit.rs`

## Risks

- Delete drafts must not silently coexist with row update drafts on the same row; frontend state needs a deterministic rule.
- Backend prepared plans must stay hash-stable and transaction-safe when mixing mutation kinds.
- The grid must clearly distinguish a pending delete from a pending cell edit so operators do not miss destructive intent.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: stage row delete, revert it, prepare commit, inspect delete preview, commit, and verify the grid refreshes
