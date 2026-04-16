# Plan: Connection Governance Center

## Summary

This wave upgrades the DB Workbench connection center from a flat CRUD list into an operator-grade connection catalog. The shared connection contract will grow lightweight governance fields, the Rust config model will persist them transparently through existing JSON storage, and the React connection center will expose richer profile editing, search, grouping, and favorite-first organization.

## Scope

- Extend `DbConnectionConfig` with catalog metadata needed for organization.
- Expose environment, readonly, default schema, color tag, favorite, group, and notes in the connection form.
- Add search and environment/favorites filtering to the connection center.
- Group rendered saved connections by connection group and surface metadata badges.
- Keep discovery prefill, secure password preservation, and existing workspace launch flows intact.

## Likely Touchpoints

- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/storage.rs`
- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/db_connector/grid_edit.rs`
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`

## Risks

- New connection fields must deserialize safely for legacy saved connection JSON.
- The connection center UI must stay dense and tool-like rather than turning into a settings form dump.
- Grouping/filtering should not break the existing selected connection behavior.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: create/edit grouped and favorite connections, search/filter them, then launch the workbench from a filtered result
