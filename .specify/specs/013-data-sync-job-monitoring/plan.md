# Plan: Data Sync Background Job Monitoring

## Summary

This wave makes Data Sync apply operationally observable. The backend will persist and launch apply execution as a detached background task, while the workbench polls job detail and updates the operator view when the job exits `running`. Failure handling will annotate the table result that caused rollback with more precise statement context.

## Scope

- Return `running` jobs immediately from apply execute.
- Run the actual apply transaction in a background runtime task.
- Persist terminal job updates from the background worker.
- Improve failure context recorded on the relevant table result.
- Poll running job detail from the workbench and auto-refresh the UI.

## Likely Touchpoints

- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/db_connector/commands.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

## Risks

- Background execution must own all state it needs; borrowed runtime state cannot leak into the spawned task.
- A failed spawn/update path must still leave the job in a terminal state where possible.
- Polling should stay bounded and stop once the job is terminal.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: start apply, observe running state, wait for terminal refresh, inspect failure detail if an error is induced
