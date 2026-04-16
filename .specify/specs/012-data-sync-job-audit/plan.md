# Plan: Data Sync Apply Job Lifecycle And Audit

## Summary

This wave makes Data Sync apply auditable without redesigning the engine. It adds a small storage migration for job-audit columns, persists a `running` job record before execution, updates it after completion or failure, and exposes the saved SQL preview metadata in workbench job detail.

## Scope

- Extend job storage with:
  - SQL preview lines JSON
  - preview truncated flag
  - statement count
- Add safe SQLite in-place column migration for existing installs.
- Persist an apply job before execution begins and update the same job after execution ends.
- Extend shared/Rust job detail responses with audit fields.
- Render those audit details in the workbench sync pane.

## Likely Touchpoints

- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/storage.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

## Risks

- SQLite migrations must be additive and resilient on already-initialized local databases.
- Audit payloads should stay bounded; the existing SQL preview truncation logic should remain the cap.
- The job lifecycle implementation must preserve the same job ID across `running` and terminal updates.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check: execute apply, reload job detail, and verify lifecycle timestamps plus SQL audit preview are visible
