# Phase 06 Runtime Resilience Runbook

Date: 2026-04-11  
Owner: autonomous execution (`$gsd-autonomous 6`)

## Scenario Matrix

| Scenario | Goal | Command(s) | Pass Condition | Artifact |
|---|---|---|---|---|
| S1. Type/contract integrity | Ensure runtime contracts compile in current workspace | `npm run check` | Exit code `0` | `artifacts/01-npm-check.log` |
| S2. Operator-path regressions | Exercise query/load-more/cancel/export/edit/sync workflow assertions | `node --import tsx --test --experimental-strip-types test/client/db-workbench-runtime-phase15.test.tsx test/client/db-workbench-flow-phase16.test.tsx test/client/db-workbench-grid-edit-flow-phase17.test.tsx test/client/db-workbench-data-sync-flow-phase18.test.tsx` | `pass 16`, `fail 0` | `artifacts/02-cross-phase-client-tests.log` |
| S3. Runtime query interruption guards | Validate cancellation token cleanup and paging safety | `cargo test --manifest-path src-tauri/Cargo.toml query -- --nocapture` | `17 passed`, `0 failed` | `artifacts/03-rust-query-tests.log` |
| S4. Schema recovery context | Validate schema resolution defaults and explicit schema binding | `cargo test --manifest-path src-tauri/Cargo.toml introspect -- --nocapture` | `3 passed`, `0 failed` | `artifacts/04-rust-introspect-tests.log` |

## Recovery Interpretation Guide

- If S2 fails while S3/S4 pass: prioritize frontend workflow regression inspection.
- If S3 fails: treat query cancel/paging as runtime blocker; inspect `src-tauri/src/db_connector/query.rs` and associated tests.
- If S4 fails: treat schema-context regression as runtime blocker for PostgreSQL workflows.
- Non-blocking compiler warnings in Rust logs are tracked separately and do not invalidate pass criteria unless tests fail.

## Re-run Procedure

1. Run all four commands in matrix order.
2. Overwrite artifacts under `artifacts/` to keep latest deterministic run.
3. Update `06-LIVE-RUNTIME-RESILIENCE-EVIDENCE.md` and `06-VERIFICATION.md` with new timestamps/results.
