# Spec: DB Object DDL Inspection And Deeper Metadata

## Problem

The current workbench is usable for query execution and table browsing, but it still lacks one of the most basic professional workflows: inspect object DDL and browse deeper metadata without leaving the tool.

## Goal

Add a reachable object inspection workflow that lets operators view generated DDL and richer metadata for tables and views, with room to expand to functions, procedures, triggers, and sequences.

## Requirements

### R1. Reachable Object Inspection

The operator must be able to open an inspection surface from the existing object explorer.

### R2. Table/View DDL

The backend must provide DDL text for supported objects, starting with tables and views.

### R3. Richer Metadata

The workbench must surface indexes, foreign keys, comments, and column metadata in a denser inspection view.

### R4. Honest Coverage

Unsupported object kinds must be labeled explicitly rather than implied as available.

## Acceptance Criteria

1. The sidebar or workbench exposes an object inspection action.
2. Tables and views can return readable DDL text through the host/bridge/backend path.
3. The UI presents DDL and metadata in a desktop-tool style pane.
4. Unsupported objects are explicitly marked as not yet implemented.
