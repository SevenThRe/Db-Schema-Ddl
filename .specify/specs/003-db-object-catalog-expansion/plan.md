# Plan: DB Object Catalog Expansion In Object Explorer

## Summary

This wave expands DB Workbench from a table/view explorer into a broader database object catalog, while reusing the object inspection surface introduced in 002.

## Scope

- Extend shared and Rust schema snapshot types with routines, triggers, and sequences.
- Add MySQL/PostgreSQL introspection queries for the new object kinds.
- Extend the left object explorer with new sections and counts.
- Route unsupported object kinds into the existing inspection pane.
- Extend explorer filtering to cover the new object kinds.

## Likely Touchpoints

- `shared/schema.ts`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/introspect.rs`

## Risks

- PostgreSQL routines can be overloaded, so labels need enough identity to avoid ambiguity.
- MySQL has no native sequences, so the contract must tolerate driver-specific empty lists.
- Unsupported inspection must be explicit without making the explorer feel broken.

## Verification

- Contract review across TS and Rust schema snapshot definitions
- Reachability review from explorer rows to inspection pane
- Static inspection of MySQL/PostgreSQL query coverage for routines/triggers/sequences
- Full end-to-end verification once local Node and Rust toolchains are available
