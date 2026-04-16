## Phase 28 Context

Goal: move DB Workbench grid editing from cell-update baseline to a coherent operator workflow that can stage, review, revert, and commit larger edit sets without losing row context.

Current repo reality:

- Update staging is already real in the canonical workbench route.
- Delete staging is already supported by shared contracts and Rust commit planning, but the frontend does not expose it.
- Insert staging is not supported by the current grid-edit contract or runtime yet.

Confirmed implementation boundaries:

- Canonical surface: `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- Grid UI: `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- Review dialog: `client/src/components/extensions/db-workbench/GridEditCommitDialog.tsx`
- Shared delete summary helper: `client/src/components/extensions/db-workbench/grid-edit-summary.ts`
- Runtime planner/commit: `src-tauri/src/db_connector/grid_edit.rs`

Execution split for this phase:

1. 28-01: land staged row deletes in the existing starter-query editing workflow.
2. 28-02: add inserted-row drafting and commit support as a follow-on slice.

Guardrails to preserve while moving fast:

- Keep editing fail-closed for non-table or non-PK-safe result sets.
- Keep review explicit through `prepareGridCommit` before `commitGridEdits`.
- Prevent conflicting update/delete staging for the same row.
- Preserve row context in summaries and memory-trim protection.
