# Spec: Schema Diff In Unified Workbench

## Problem

The DB Workbench entry shell has been unified, but structural schema diff still lives in a legacy outer route. That leaves one of the core database-tool workflows outside the operator's primary workspace and preserves the same mental split the product is trying to remove.

## Goal

Bring schema diff into the unified DB Workbench so operators can compare the active connection against another saved connection without leaving the main work surface.

## Requirements

### R1. Workbench-Native Schema Diff

The unified workbench must expose schema diff as a first-class pane alongside the other operator surfaces.

### R2. Active Connection As Source

When launched inside the workbench, the active connection must act as the diff source by default.

### R3. Legacy Diff Preservation

The older outer diff route may remain for migration safety, but the same comparison capability must now be reachable inside the workbench.

### R4. Shared Viewer

The schema diff visualization should use one reusable rendering path rather than forking a second implementation.

## Acceptance Criteria

1. The workbench shows a reachable schema diff pane inside `WorkbenchLayout`.
2. Operators can select a target saved connection and compare it against the active connection without leaving the workbench.
3. The diff viewer renders the same structured / DDL comparison content in both legacy and unified paths.
4. `npm run check` and `cargo check` continue to pass.
