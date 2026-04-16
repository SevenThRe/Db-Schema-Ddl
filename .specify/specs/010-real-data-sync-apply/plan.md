# Plan: Real Data Sync Apply

## Summary

This wave completes the already-reachable Sync workbench surface by wiring the backend apply engine and removing the hard-coded preview-only UI gate.

## Scope

- Keep the existing compare preview, row delta, apply preview, and job detail surfaces.
- Replace preview-only SQL banners with real apply SQL preview lines built from stored compare rows.
- Execute supported row actions inside a target DB transaction.
- Persist apply jobs and results through the existing storage tables.
- Flip `WorkbenchLayout` gating from hard-coded preview-only to blocker-driven execution.

## Likely Touchpoints

- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/query.rs` helpers (read-only shared utilities only if needed)
- `src-tauri/src/storage.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

## Risks

- Dynamic row apply must stay deterministic from stored compare artifacts, not ad hoc frontend state.
- SQL generation needs safe literal escaping and correct identifier quoting for both MySQL and PostgreSQL.
- The first execution wave should prefer atomic safety over broad feature ambition; a failed apply should not silently produce partial writes.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: Sync preview enables apply when guards pass, execute returns a real job id/status, and job detail remains viewable
