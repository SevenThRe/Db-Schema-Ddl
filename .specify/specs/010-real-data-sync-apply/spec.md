# Spec: Real Data Sync Apply

## Problem

The unified DB Workbench already exposes a reachable `Sync` surface, but the apply path is still explicitly preview-only. That leaves the operator with a visible compare-and-review workflow that cannot complete the final action, which is a major completeness gap versus mainstream database workbench tools.

## Goal

Turn the existing Sync flow into a real operator path that can preview, execute, and review row-level data apply jobs inside the unified workbench.

## Requirements

### R1. Real Apply Execution

When compare preview and apply preview are valid, the backend must execute supported insert, update, and delete actions against the target connection instead of returning a preview-only error.

### R2. Safe Execution Gating

Apply execution must remain blocked for expired artifacts, changed target snapshots, readonly targets, and any existing high-risk blockers already modeled by the workbench.

### R3. Persisted Job Visibility

Executed apply jobs must continue to produce persisted job detail that the existing workbench UI can reopen and inspect.

### R4. Unified Workbench Completion

The `Sync` tab inside `WorkbenchLayout` must present apply as an executable action when guards pass, rather than hard-coding preview-only behavior.

## Acceptance Criteria

1. `db_data_apply_preview` returns real executability based on blockers instead of always preview-only.
2. `db_data_apply_execute` performs real apply execution for supported selections and persists a job record plus table results.
3. `WorkbenchLayout` enables the apply action when preview/job state is valid and calls the real execute path.
4. TypeScript and Rust static checks continue to pass.
