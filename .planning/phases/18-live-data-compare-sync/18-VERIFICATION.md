---
status: pending
phase: 18-live-data-compare-sync
verified_at: 2026-04-08
must_have_score: "Pending final phase verification"
---

# Phase 18 Verification

## Observable Truths

- Workbench now exposes a first-class live data sync path in the main operator shell, with explicit compare direction shown as source -> target and row-level diff drilldown.
- Apply execution is preview-first and fail-closed for stale guards (`target_snapshot_changed`, `artifact_expired`) and read-only/missing-key blockers.
- Production targets require typed confirmation of the target database name before execute is enabled, and apply job detail remains observable after execution.

## Required Artifacts

| Artifact | Evidence |
|---|---|
| `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` | Contains end-to-end sync workflow handlers: `handlePreviewDataDiff`, `handleLoadDataDiffDetail`, `handlePreviewDataApply`, `handleExecuteDataApply`, `handleLoadDataApplyJobDetail`; includes blocker handling for `target_snapshot_changed`, `artifact_expired`, `unsafe_delete_threshold`; includes typed confirmation for prod target. |
| `client/src/components/extensions/db-workbench/DataSyncRowDiffPane.tsx` | Row-level diff pane renders and status tones for `source_only`, `target_only`, `value_changed` plus structured/JSON diff modes. |
| `client/src/components/extensions/db-workbench/data-sync-row-diff.ts` | Adapter maps row statuses into structured diff actions and preserves field-level row changes. |
| `test/client/db-workbench-data-sync-phase18.test.tsx` | Regression coverage for direction copy (`source -> target`), row status semantics, and unchanged-row toggle behavior. |
| `test/client/db-workbench-data-sync-flow-phase18.test.tsx` | Regression coverage for compare -> preview -> execute flow, stale guard blockers, `unsafe_delete_threshold` warning, prod typed confirmation gate, and apply job detail reachability. |

## Requirements Coverage

| Requirement | Verification Evidence | Commands | Status |
|---|---|---|---|
| `SYNC-01` | Compare summary and row drilldown are implemented in `WorkbenchLayout.tsx` with `previewDataDiff` + `fetchDataDiffDetail` and surfaced through `DataSyncRowDiffPane` statuses (`source_only`, `target_only`, `value_changed`). | `node --import tsx --test --experimental-strip-types test/client/db-workbench-data-sync-phase18.test.tsx test/client/db-workbench-data-sync-flow-phase18.test.tsx` -> PASS (8/8) | PASS |
| `SYNC-02` | Apply preview/execute path is preview-first and blocked on stale guards; UI explicitly renders and enforces `target_snapshot_changed`, `artifact_expired`, and `unsafe_delete_threshold` behavior before execute. | `rg -n "previewDataDiff|previewDataApply|executeDataApply|target_snapshot_changed|artifact_expired|unsafe_delete_threshold" client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` -> PASS | PASS |
| `SYNC-03` | Execute flow requires production typed confirmation and keeps apply job status/detail reachable via `fetchDataApplyJobDetail`; tests assert confirmation gate and job detail action presence. | `node --import tsx --test --experimental-strip-types test/client/db-workbench-data-sync-phase18.test.tsx test/client/db-workbench-data-sync-flow-phase18.test.tsx` -> PASS (8/8) | PASS |

## Result

- `node --import tsx --test --experimental-strip-types test/client/db-workbench-data-sync-phase18.test.tsx test/client/db-workbench-data-sync-flow-phase18.test.tsx` -> PASS
- `npm run check` -> PASS (`tsc`)
- `rg -n "previewDataDiff|previewDataApply|executeDataApply|target_snapshot_changed|artifact_expired|SYNC-01|SYNC-02|SYNC-03" client/src/components/extensions/db-workbench/WorkbenchLayout.tsx test/client/db-workbench-data-sync-flow-phase18.test.tsx .planning/phases/18-live-data-compare-sync/18-VERIFICATION.md` -> PASS
- `node C:/Users/ISI202502/.codex/get-shit-done/bin/gsd-tools.cjs verify phase-completeness 18` -> PENDING (expected to pass after `18-04-SUMMARY.md` is added)

Verification status: **`pending`** until phase-level completeness re-check.
