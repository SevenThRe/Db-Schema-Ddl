# Plan: DB Workbench Foundation Toward Industry Standard

## Summary

This wave focuses on trust and operator usability rather than feature breadth. The work is intentionally split into honest execution semantics, object navigation improvements, and backend consistency fixes.

## Current Reality

- Main workbench path is reachable through `DbConnectorWorkspace -> WorkbenchLayout`.
- Query execution, Explain, grid editing, and export are real.
- Data Sync compare is still placeholder-based.
- Data Sync apply engine is not real and must remain disabled until implemented.

## Workstreams

### Workstream A: Honest Sync State

- Disable real apply execution in backend.
- Mark apply as preview-only in UI.
- Preserve compare and review flows.

Primary files:

- `src-tauri/src/db_connector/data_apply.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

### Workstream B: Object Explorer Usability

- Add local object filtering in the sidebar.
- Filter across table/view names and child metadata.
- Preserve schema switch, refresh, double-click open, and starter queries.

Primary file:

- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`

### Workstream C: Backend Execution Consistency

- Use runtime-hydrated connections for `db_diff`.
- Use runtime-hydrated connections for `db_query_explain`.
- Apply active PostgreSQL schema context to Explain.

Primary files:

- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/explain.rs`

### Workstream D: Next P0

- Replace placeholder Data Diff with real source/target table reads, comparison, persistence, and detail loading.

Primary file:

- `src-tauri/src/db_connector/data_diff.rs`

## Risks

- `WorkbenchLayout.tsx` is large and still a regression risk zone.
- Toolchain validation is blocked in the current shell because external `node`/`cargo` startup is failing.
- Real Data Diff will need careful SQL generation and row key handling across MySQL/PostgreSQL.

## Verification

- Code review of affected paths
- Confirm UI strings and gating logic
- Confirm backend no longer simulates apply execution
- Confirm `db_diff` and `db_query_explain` now load runtime connections

## Exit Condition

The wave is complete when the workbench is more trustworthy than before, even though real Data Diff implementation remains the next scheduled P0.
