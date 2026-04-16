# Spec: DB SQL Daily-Driver Consistency

## Problem

DB Workbench already has strong SQL feature slices such as tabs, autocomplete, SQL library, parameter review, script review, explain, and history. But they were introduced across separate waves, so the product still risks feeling like a set of tools instead of one coherent daily-driver workflow.

## Goal

Unify the SQL authoring and execution experience so the workbench reads as one consistent daily-driver product surface.

## Requirements

### R1. The Canonical SQL Workflow Must Be Coherent

The editor, SQL library, history, run actions, and result tabs must read as one integrated workflow rather than independent toolbar features.

### R2. Execution Review Must Remain Standardized

Parameter review, dangerous SQL review, and script review must remain part of one consistent execution path and be described consistently in the product surface.

### R3. Honest Diagnostics Must Be Preserved

The product must describe explain, load-more, full export, and cancellation behavior accurately without overselling current runtime depth.

### R4. Session And History Must Support Daily Return Use

Session recovery, query history, and reusable SQL context must remain visibly connection-scoped and reliable enough for repeat operator use.

## Acceptance Criteria

1. The SQL authoring surface reads as one coherent daily-driver workflow.
2. Execution-review steps are consistently described and do not feel bolted on.
3. Runtime constraints for explain/export/load-more/cancel are described honestly.
4. `npm run check` passes.
5. Targeted client tests for SQL workflow copy/state consistency pass.
