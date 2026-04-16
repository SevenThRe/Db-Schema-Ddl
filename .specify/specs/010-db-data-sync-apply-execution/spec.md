# Spec: Data Sync Apply Execution

## Problem

The unified DB Workbench already exposes row-level compare review and apply preview, but the final execute step is still hardcoded as preview-only. That makes the flow look complete while stopping short of a real operator outcome.

## Goal

Turn Data Sync apply from preview-only scaffolding into a real guarded execution path that can apply selected insert, update, and delete actions to the target connection and persist job results for review.

## Requirements

### R1. Real Execution Path

The backend must execute approved data sync selections against the target connection instead of returning a preview-only error.

### R2. Existing Guardrails Stay In Force

Artifact expiry, target snapshot drift, readonly target connections, and other blocking guards must still prevent execution.

### R3. Job Result Persistence

Execution must persist an apply job record and table-level result summary so the existing job detail surface remains useful.

### R4. Unified Workbench UX

The Sync tab inside the unified workbench must expose the real execute action, status, and prod confirmation flow without sending the operator back to legacy paths.

## Acceptance Criteria

1. `db_data_apply_preview` reports `executable=true` when no blocking guard is active.
2. `db_data_apply_execute` executes selected insert, update, and delete mutations against the target connection in the backend.
3. Successful and failed apply runs persist job detail that can be reloaded from the existing job detail UI.
4. The Sync tab no longer hardcodes preview-only behavior when execution is allowed.
5. `npm run check` and `cargo check` pass after the wave lands.
