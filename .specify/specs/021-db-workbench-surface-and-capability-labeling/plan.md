# Plan: DB Workbench Surface And Capability Labeling

## Summary

This wave turns the 020 productization capability matrix into concrete UI and documentation language. It does not change backend behavior. It changes how the product describes what is primary, secondary, or preview so operators can trust the surface model.

## Likely Touchpoints

- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `docs/`
- targeted client tests for shell/workbench copy

## Risks

- Over-labeling could clutter the operator UI if it becomes badge spam.
- Under-labeling would fail the productization goal and keep capability truth ambiguous.

## Verification

- `npm run check`
- targeted client tests for shell copy and status language
- manual spot-check that canonical vs legacy/preview language reads clearly in the desktop shell
