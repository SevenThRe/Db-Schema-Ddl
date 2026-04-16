# Plan: Data Sync Apply Execution

## Summary

This wave cashes in the existing Data Sync scaffolding. The compare artifacts and job persistence tables already exist; the missing piece is a guarded mutation executor that reads selected compare rows, generates deterministic insert/update/delete statements for the target connection, runs them transactionally, and reports the outcome back to the existing workbench UI.

## Scope

- Keep the current compare preview and row-review UX.
- Replace preview-only execute behavior in Rust with a real transaction-backed apply path.
- Reuse compare artifacts from storage as the source of truth for row values and row keys.
- Persist apply job results using the existing storage tables.
- Enable the real execute path in `WorkbenchLayout.tsx`.

## Likely Touchpoints

- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/query.rs`
- `src-tauri/src/db_connector/grid_edit.rs`
- `src-tauri/src/storage.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `.specify/specs/009-db-local-discovery/tasks.md`

## Risks

- Mutation ordering and rollback semantics must stay safe; this wave should prefer one transaction per apply execution over partial silent commits.
- Compare artifacts store JSON row payloads, so generated SQL needs careful identifier quoting and value binding across MySQL and PostgreSQL.
- The UI must not suggest executability when preview blockers or prod confirmation still forbid execution.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: compare preview -> apply preview -> execute apply -> job detail reload
