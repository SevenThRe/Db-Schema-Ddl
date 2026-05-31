# Current Assessment Snapshot

Assessment date: 2026-04-18

## Current reality

- The repository is already beyond an Excel-to-DDL converter.
- The DB workbench has real runtime wiring for:
  - saved connections and local discovery
  - schema introspection
  - query execution, cancellation, and export
  - EXPLAIN plans
  - object inspection
  - row edit prepare/commit flows
  - data sync compare/apply flows
  - persisted background job history
  - local SQL Copilot runtime status and probe
- Legacy and newer workbench paths still coexist intentionally.

## Highest-signal defects and gaps

1. Data Sync operator-role clarity is weaker than it should be.
   Evidence:
   - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
   - `src-tauri/src/db_connector/data_diff.rs`
   - `src-tauri/src/db_connector/data_apply.rs`
   Problem:
   - source and target can default to the same connection, which weakens the mental model and safety posture of a cross-system synchronization workflow.

2. Product messaging still lags runtime reality in a few places.
   Evidence:
   - comments and labels still use `preview`, `planned`, or migration-era wording in files that now back live flows
   Problem:
   - operators and future agents can underestimate or misread what is already shipped.

3. The primary workbench path is strong, but migration cleanup is incomplete.
   Evidence:
   - `client/src/components/extensions/DbConnectorWorkspace.tsx`
   Problem:
   - legacy tools remain necessary for some scenarios, which keeps the mental model broader than ideal.

4. Editing is intentionally constrained to deterministic table-context results rather than arbitrary SQL.
   Evidence:
   - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
   - `src-tauri/src/db_connector/grid_edit.rs`
   Note:
   - this is an intentional safety boundary, not automatically a bug.

## Recommended sequence

### Now

- tighten source/target guardrails for Data Sync
- keep destructive and cross-system role labels explicit
- add regression coverage for those guardrails

### Next

- reduce migration ambiguity between legacy and main workbench surfaces
- audit labels and comments that still understate shipped capability
- expand end-to-end verification around the main daily-driver workflows

### Later

- consolidate secondary panes once parity is proven
- deepen operator-grade affordances for advanced editing and sync review
