---
phase: 27-job-center-and-execution-history
plan: 01
subsystem: background-job-runtime-and-storage
tags: [db-workbench, job-center, data-sync, storage, tauri]
requires: []
provides:
  - Recent background-job list contract for the canonical workbench
  - Persisted recent-job query over existing apply-job storage
  - Tauri command and bridge wiring for Job Center history
affects: [shared, client, tauri, test]
tech-stack:
  added: []
  patterns: [generic job-summary contract, persisted history query, source-level regression tests]
key-files:
  created:
    - test/server/job-center-phase27.test.ts
  modified:
    - shared/schema.ts
    - client/src/extensions/host-api.ts
    - client/src/extensions/host-api-runtime.ts
    - client/src/extensions/host-context.tsx
    - client/src/lib/desktop-bridge.ts
    - src-tauri/src/db_connector/mod.rs
    - src-tauri/src/db_connector/commands.rs
    - src-tauri/src/db_connector/data_apply.rs
    - src-tauri/src/storage.rs
    - src-tauri/src/lib.rs
completed: 2026-04-12T16:10:00+08:00
---

# Phase 27 Plan 01 Summary

The backend now exposes durable recent background jobs instead of forcing the UI to know a job id in advance.

## Accomplishments

- Added a generic `DbBackgroundJobSummary` / `DbBackgroundJobListResponse` contract while keeping the current runtime honest that only `data-apply` jobs are wired.
- Exposed `listBackgroundJobs` through the shared contract, host API, runtime bridge, and Tauri invoke handler.
- Added `list_db_data_apply_jobs` in storage and a `db_background_job_list` runtime path that maps persisted apply-job rows into review-friendly summaries.
- Added focused server-side regression tests to lock the recent-job contract and runtime wiring.

## Verification

- `npm run check`: **passed**
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/server/job-center-phase27.test.ts`: **passed**
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`: **passed**

## Self-Check: PASS
