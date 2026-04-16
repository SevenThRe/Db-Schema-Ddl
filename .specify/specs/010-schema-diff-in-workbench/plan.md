# Plan: Schema Diff In Unified Workbench

## Summary

This wave closes one of the last major DB Workbench fragmentation gaps by moving structural schema diff into `WorkbenchLayout`. It reuses the existing diff viewer logic by extracting a shared schema diff viewer component and wiring a new workbench pane around it.

## Scope

- Add a reusable schema diff viewer component under `db-workbench/`.
- Replace the legacy inline diff panel with that shared viewer.
- Extend `WorkbenchLayout` with a new schema diff pane, target-connection selection, compare action, and comparison state.
- Keep the legacy outer diff route intact for migration safety.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/SchemaDiffPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/DbConnectorWorkspace.tsx`

## Risks

- Workbench result tabs already host results, explain, sync, and inspection; adding schema diff must not make the area unreadable or confuse data sync with structural diff.
- The workbench compare flow should reuse existing backend calls and not introduce divergent semantics from the legacy route.
- Active-source vs target-selection copy must stay explicit so operators do not invert environments accidentally.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: compare active connection to another saved connection from inside the workbench, inspect structured and DDL diff views, and confirm legacy diff still renders
