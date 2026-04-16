# Plan: Query Memory Guardrails

## Summary

This wave treats result browsing as an operational memory boundary. The backend will stop eagerly materializing unsupported query results after `limit + 1` rows, and the frontend will cap retained pageable rows to a fixed in-memory window with explicit UI messaging when older rows are trimmed.

## Scope

- Replace unsupported-result `fetch_all` execution with bounded streaming collection.
- Preserve `hasMore` semantics while allowing `totalRows` to become unknown when truncation is detected early.
- Add query batch metadata for retained-row window offset and cumulative loaded count.
- Cap retained pageable rows in the workbench and protect pending edited rows from being discarded where possible.
- Surface retained-window state in the result grid and warn once when trimming starts.

## Likely Touchpoints

- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/query.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`

## Risks

- Frontend trimming must not silently hide pending edited rows that are still staged for commit.
- Unsupported-result streaming must keep column metadata intact even when only one row is seen.
- UI metadata must stay backward-compatible for batches produced by existing runtime paths.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: run `SHOW`/`EXPLAIN`, then repeatedly `Load more` on a large pageable result and confirm the retained-row window message appears
