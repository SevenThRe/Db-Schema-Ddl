# Plan: SQL Parameter Review

## Summary

This wave adds a front-end parameter review seam on top of the existing SQL execution pipeline. A lightweight parser will detect named placeholders in SQL while ignoring strings/comments and PostgreSQL casts, a review dialog will collect and preview resolved values, and the workbench will render final SQL before handing it to the current dangerous SQL preview and execution flow.

## Scope

- Add a client-side SQL placeholder parser and renderer for `:name` and `{{name}}`.
- Support literal rendering defaults plus an explicit raw-expression escape for operators who need SQL functions or expressions.
- Add a parameter review dialog with field entry and rendered SQL preview.
- Wire `handleExecute` so parameterized SQL pauses for review, then resumes normal execution with preserved statement selection semantics.
- Keep backend contracts unchanged for this wave.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/sql-parameters.ts`
- `client/src/components/extensions/db-workbench/SqlParametersDialog.tsx`
- `client/src/components/ui/textarea.tsx`
- `test/client/db-workbench-sql-parameters-phase17.test.ts`

## Risks

- Placeholder detection must not incorrectly capture `::type` PostgreSQL casts or placeholder-like text inside comments/strings.
- Cursor-offset statement execution must keep targeting the intended statement after substitution.
- Literal rendering must be explicit enough that operators understand when they are injecting raw SQL expressions.

## Verification

- `npm run check`
- `node --test --experimental-strip-types test/client/db-workbench-sql-parameters-phase17.test.ts`
- Manual desktop check: run a parameterized snippet, fill values, preview the rendered SQL, and confirm the existing dangerous SQL dialog still appears for destructive statements.
