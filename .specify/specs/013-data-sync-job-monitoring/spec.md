# Spec: Data Sync Background Job Monitoring

## Problem

Data Sync apply now persists lifecycle and SQL audit, but the execute path is still request-blocking. Operators do not see a meaningful `running` state in the workbench because the command only returns after the transaction finishes. Failure context is also still too coarse when a single statement causes rollback.

## Goal

Turn Data Sync apply into a real background job that returns immediately, can be polled while running, and records a more precise failure location when execution rolls back.

## Requirements

### R1. Background Apply Execution

Apply execution must persist a `running` job record and return control to the UI without waiting for the transaction to finish.

### R2. Pollable Running State

The workbench must actively refresh running apply jobs and transition the UI when the job reaches a terminal state.

### R3. Finer Failure Context

When an apply statement fails, job detail must include table-level failure context that is more precise than a generic transaction failure.

### R4. Preserve Existing Safety Gates

Guardrails from prior waves must remain enforced before a background job is launched.

## Acceptance Criteria

1. `executeDataApply` returns quickly with a `running` job response and a persisted job id.
2. The workbench polls job detail until the job reaches `completed` or `failed`.
3. Failed jobs show more specific table/action failure context in job detail.
4. `npm run check` and `cargo check` continue to pass.
