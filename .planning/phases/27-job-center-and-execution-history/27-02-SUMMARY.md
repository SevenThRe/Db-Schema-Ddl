---
phase: 27-job-center-and-execution-history
plan: 02
subsystem: persistent-job-center-ui
tags: [db-workbench, job-center, session, sync, review]
requires: [27-01]
provides:
  - Persistent Job Center pane inside the canonical workbench route
  - Session restore for jobs tab and selected job id
  - Reopen-sync action from persisted job history
affects: [client, test]
tech-stack:
  added: []
  patterns: [canonical result-tab extension, session-backed selection restore, list-detail operator pane]
key-files:
  created:
    - client/src/components/extensions/db-workbench/JobCenterPane.tsx
    - test/client/job-center-phase27.test.ts
  modified:
    - client/src/components/extensions/db-workbench/workbench-session.ts
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
completed: 2026-04-12T16:10:00+08:00
---

# Phase 27 Plan 02 Summary

The canonical DB workbench now has a persistent Job Center instead of treating job history as a sync-footer side effect.

## Accomplishments

- Added `jobs` as a first-class workbench result tab and persisted the selected job id in `workbench-session.ts`.
- Added a dedicated `JobCenterPane` with a dense list/detail split for recent background DB work.
- Centralized recent-job refresh and selected-job detail loading in `WorkbenchLayout`, with reopen wiring back into the sync context.
- Reduced dependence on transient sync-footer detail by making `Open Job Center` the durable review path.
- Added focused client-side regression tests for jobs-tab persistence and reopen wiring.

## Verification

- `npm run check`: **passed**
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/client/job-center-phase27.test.ts`: **passed**
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`: **passed**

## Self-Check: PASS
