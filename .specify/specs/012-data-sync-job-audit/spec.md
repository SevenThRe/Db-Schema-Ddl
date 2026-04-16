# Spec: Data Sync Apply Job Lifecycle And Audit

## Problem

Data Sync apply can now execute with trusted guardrails, but its job record is still too thin. The backend persists only the terminal outcome and coarse table summaries, so operators cannot inspect the actual lifecycle or the SQL batch that was executed after the fact.

## Goal

Persist a real apply job lifecycle and enough SQL audit context for operators to review what an apply run was about, what state it reached, and which SQL batch it intended to execute.

## Requirements

### R1. Real Job Lifecycle

The backend must persist apply jobs as a lifecycle, not only as a terminal write. At minimum the lifecycle must include `running` and a terminal state.

### R2. Job-Level SQL Audit

Apply jobs must retain the SQL preview batch used for execution planning, including whether the preview was truncated and how many statements were in scope.

### R3. Non-Destructive Storage Upgrade

Existing local databases must be upgraded in place; the new audit fields must not require users to delete their local app database.

### R4. Workbench Visibility

The workbench sync pane must surface the stored apply job audit details so operators can review them after execution.

## Acceptance Criteria

1. Apply jobs are persisted before transaction execution begins and then updated to a terminal state after completion.
2. Job detail responses include SQL preview lines, truncation metadata, and statement count.
3. Storage schema upgrades in place for existing local databases.
4. The workbench sync pane renders the returned audit details.
5. `npm run check` and `cargo check` continue to pass.
