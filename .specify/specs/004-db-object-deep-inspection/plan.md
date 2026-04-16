# Plan: Deep Inspection For Cataloged DB Objects

## Summary

This wave upgrades DB Workbench object inspection from `table/view only` into a broader operator-grade inspection surface by adding routines, triggers, and sequences on top of the existing 002/003 groundwork.

## Scope

- Add backend inspection handlers for functions, procedures, triggers, and PostgreSQL sequences.
- Reuse driver metadata queries and object explorer identities so PostgreSQL overloaded routines and table-scoped triggers resolve the intended target.
- Update object explorer click payloads where object-name identity is currently ambiguous.
- Refresh inspection coverage notes and empty-state messaging to match actual runtime support.

## Likely Touchpoints

- `src-tauri/src/db_connector/object_inspect.rs`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `.specify/specs/004-db-object-deep-inspection/tasks.md`

## Risks

- PostgreSQL routines are overloadable, so inspection must distinguish same-name functions by signature.
- PostgreSQL trigger names can repeat across tables, so explorer identity must carry table context.
- MySQL `SHOW CREATE` result shapes differ by object type, so result-column extraction must be defensive.
- Sequence DDL will be generated from catalog metadata rather than copied from a single built-in `SHOW CREATE` path.

## Verification

- Static contract review across object explorer payloads and backend inspection dispatch
- Static inspection of MySQL/PostgreSQL object-definition SQL paths
- Manual E2E verification once local Node and Rust toolchain execution is available
