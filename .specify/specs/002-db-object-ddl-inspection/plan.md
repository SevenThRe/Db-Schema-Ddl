# Plan: DB Object DDL Inspection And Deeper Metadata

## Summary

This wave targets one missing professional baseline: opening an object and inspecting its DDL and metadata without leaving DB Workbench.

## Scope

- Add contract types for object inspection requests/responses.
- Add bridge and host API support.
- Add Tauri command(s) for table/view DDL retrieval.
- Add a new right-side pane or tab for inspection content.

## Likely Touchpoints

- `shared/schema.ts`
- `client/src/extensions/host-api.ts`
- `client/src/lib/desktop-bridge.ts`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/introspect.rs` or a new backend module

## Risks

- MySQL and PostgreSQL DDL extraction differ substantially.
- The workbench shell is already large, so new UI should avoid increasing coupling.
- Unsupported object kinds need explicit staging, not silent omission.

## Verification

- Contract review across shared, bridge, and backend layers
- Reachability check from object explorer to inspection pane
- DDL output sanity checks for at least one MySQL and one PostgreSQL object
