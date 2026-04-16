# Plan: Standalone Inspection For Indexes And Foreign Keys

## Summary

This wave finishes the current schema-browser object family by turning table-nested indexes and foreign keys into standalone inspection targets, reusing the inspection surface introduced in 002 and extended in 004.

## Scope

- Add index and foreign key inspection branches to `object_inspect.rs`.
- Generate DDL from the existing table snapshot metadata for both MySQL and PostgreSQL.
- Reuse `parentObjectName` to disambiguate table-local object names.
- Make nested explorer rows clickable and highlight the active inspected index or foreign key.
- Refresh coverage copy to reflect the expanded support set.

## Likely Touchpoints

- `src-tauri/src/db_connector/object_inspect.rs`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

## Risks

- Index names are often table-local rather than schema-global, so parent table identity is mandatory.
- The snapshot does not include index comments or FK actions, so this wave should stay DDL-first and metadata-light.
- PostgreSQL referenced-table qualification still assumes the active schema, matching the existing table-DDL rendering path.

## Verification

- TypeScript check for explorer callback and selection-state changes
- Rust `cargo check` for inspection dispatch and DDL builders
- Manual explorer-click verification once the desktop app is running
