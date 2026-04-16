# Spec: SQL Script Review

## Problem

DB Workbench can execute full SQL scripts, and the result grid already shows one batch per statement. But the operator experience is still too opaque for multi-statement work: there is no dedicated run-script entry point in the toolbar, no pre-run statement review, and no concise post-run script summary that highlights what succeeded or failed. Paid database tools make script execution auditable and easy to scan; this workbench still treats it as a hidden keyboard-only capability.

## Goal

Make multi-statement script execution feel like a first-class operator workflow by adding explicit script-run review before execution and clear statement-level summary after execution.

## Requirements

### R1. Script Execution Must Be First-Class In The Editor

The SQL editor must expose a visible `Run script` action in addition to the existing statement-level `Run` action.

### R2. Multi-Statement Runs Must Support Pre-Run Review

When the editor contains multiple executable statements and the operator chooses `Run script`, the workbench must show a review dialog summarizing the statements that will run and the current stop-on-error behavior before execution starts.

### R3. Script Results Must Be Summarized After Execution

After a multi-statement run, the result surface must show a compact summary of statement count, success/failure counts, and the first failed statement if any, while keeping the existing per-batch tabs.

### R4. Existing Execution And Safety Flow Must Stay Intact

Script review must still execute through the current parameter review, dangerous SQL review, and query execution flow. This wave must not fork or bypass the underlying execution path.

## Acceptance Criteria

1. The SQL editor toolbar includes a visible `Run script` action.
2. Running multiple statements opens a script review dialog before execution.
3. Multi-statement results show a concise summary with success/failure counts and failure location if applicable.
4. `npm run check` passes.
5. Targeted client tests covering statement splitting/classification and workbench/result-grid wiring pass.
