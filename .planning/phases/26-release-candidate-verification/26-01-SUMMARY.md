---
phase: 26-release-candidate-verification
plan: 01
subsystem: runtime-truth-and-cancel-safety
tags: [db-workbench, runtime, cursor-offset, cancel, release-verification]
requires: []
provides:
  - Truthful statement-under-cursor execution from editor to Rust runtime
  - Dangerous-SQL preview parity with execution target semantics
  - Stale query/export response guards after cancel or superseding requests
affects: [client, shared, tauri, test]
tech-stack:
  added: []
  patterns: [backend-owned statement targeting, active-request identity guards, focused static regression tests]
key-files:
  created:
    - test/client/db-workbench-runtime-phase26.test.ts
  modified:
    - shared/schema.ts
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
    - client/src/extensions/host-api.ts
    - client/src/extensions/host-api-runtime.ts
    - client/src/lib/desktop-bridge.ts
    - src-tauri/src/db_connector/mod.rs
    - src-tauri/src/db_connector/query.rs
completed: 2026-04-12T14:40:00+08:00
---

# Phase 26 Plan 01 Summary

Release verification no longer has to explain away runtime mismatches.

## Accomplishments

- Extended the shared contract and runtime bridge so `cursorOffset` now survives the full request path for both query execution and dangerous-SQL preview.
- Replaced the backend’s full-script behavior with one canonical target-statement resolver so `Ctrl+Enter` executes only the statement under the cursor when no text is selected.
- Tightened `WorkbenchLayout` async handling with active query/export request refs so late responses after cancel or rerun cannot overwrite newer UI state or trigger stale downloads.
- Added focused Phase 26 guard tests that lock the cursor-offset contract and the stale-response guards.

## Verification

- `npm run check`: **passed**
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/client/db-workbench-runtime-phase26.test.ts`: **passed**
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`: **passed**

## Self-Check: PASS
