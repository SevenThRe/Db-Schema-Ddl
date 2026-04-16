# Spec: SQL Parameter Review

## Problem

DB Workbench can run statements and full scripts, but every execution still assumes the editor text is already final SQL. Operators cannot keep reusable parameterized SQL in tabs or snippets and provide values at execution time the way paid database tools commonly allow. That forces manual editing, increases copy/paste mistakes, and weakens reuse for recurring operational scripts.

## Goal

Add a controlled parameter review workflow for SQL execution so operators can keep parameterized SQL in the editor, fill values at run time, preview the rendered SQL, and then execute through the existing safety gates.

## Requirements

### R1. Parameterized SQL Must Be Detectable In The Editor

The workbench must detect named placeholders in SQL before execution. This wave will support `:name` and `{{name}}` placeholders while avoiding false positives inside comments, string literals, and PostgreSQL cast syntax.

### R2. Execution Must Pause For Parameter Review

When placeholders are detected, SQL execution must pause and open a review dialog where operators can provide one value per unique placeholder and inspect the rendered SQL before continuing.

### R3. Rendered SQL Must Reuse Existing Safety Boundaries

After parameters are resolved, execution must continue through the existing dangerous SQL preview / confirmation flow and the normal query execution path. This wave must not bypass current safety checks.

### R4. Parameter Input Must Support Practical SQL Values

The review dialog must support common operator value entry without requiring perfect manual quoting. Entered values should render as SQL literals by default, while still allowing explicit raw SQL expressions when the operator needs them.

## Acceptance Criteria

1. Executing SQL with `:name` or `{{name}}` placeholders opens a parameter review dialog instead of running immediately.
2. Repeated placeholders are filled once and substituted everywhere, and the rendered SQL preview is visible before execution.
3. Confirming the dialog executes the rendered SQL via the existing dangerous-SQL and execution workflow.
4. `npm run check` passes.
5. Targeted client tests covering placeholder detection/rendering and workbench wiring pass.
