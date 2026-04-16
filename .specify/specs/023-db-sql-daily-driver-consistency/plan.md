# Plan: DB SQL Daily-Driver Consistency

## Summary

This wave does not invent major new runtime capabilities. It aligns the existing SQL authoring and execution feature set into one coherent product experience consistent with the 020 SQL productivity contract.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/SqlLibraryDialog.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/workbench-session.ts`
- related client tests and docs

## Risks

- Consistency work can devolve into copy-only polish if it does not also align workflow cues.
- Product language can accidentally overclaim SQL IDE parity if not tied to runtime truth.

## Verification

- `npm run check`
- targeted client tests for SQL workflow state/copy consistency
- manual desktop verification of the end-to-end SQL daily-driver path
