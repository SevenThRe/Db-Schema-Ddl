# Spec: DB Workbench Surface And Capability Labeling

## Problem

DB Workbench now has a real canonical workspace path, but the product still exposes legacy and advanced surfaces without a consistent status model. Operators can reach powerful capabilities, yet the UI and product copy do not clearly separate primary daily-driver workflows from migration-only or preview workflows. This makes the workbench feel less trustworthy than it actually is.

## Goal

Make DB Workbench self-describing by labeling surfaces and capabilities according to their real product status, while reinforcing the canonical workspace route.

## Requirements

### R1. The Canonical Workspace Must Be Visually And Semantically Primary

The UI and supporting product copy must clearly position `Database Workspace` as the primary operator route and demote legacy paths to secondary or migration-only status.

### R2. Advanced Or Incomplete Surfaces Must Be Labeled Honestly

Surfaces such as advanced data sync/apply must expose an explicit product status such as `Preview` rather than reading like fully generalized mature workflows.

### R3. Capability Status Must Be Consistent Across UI And Docs

The same primary/secondary/preview/internal terminology must be used consistently in the workbench shell and related product-facing docs.

### R4. Existing Reachability Must Remain Intact

This wave must not remove still-needed legacy routes or break existing entry flows; it should clarify status, not erase migration safety.

## Acceptance Criteria

1. The canonical `Database Workspace` route is clearly presented as the primary daily-driver surface.
2. Legacy routes are visibly labeled as secondary or migration-only.
3. Preview-grade advanced surfaces are labeled honestly in the UI and related docs.
4. `npm run check` passes.
5. Targeted client tests covering shell copy/status behavior pass.
