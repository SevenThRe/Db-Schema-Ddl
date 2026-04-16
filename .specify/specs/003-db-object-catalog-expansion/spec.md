# Spec: DB Object Catalog Expansion In Object Explorer

## Problem

The current DB Workbench object explorer only exposes tables and views. Professional DB tools also surface routines, triggers, and sequences so operators can understand schema coverage without leaving the workbench.

## Goal

Expand the object explorer and schema snapshot contract to include routines, triggers, and sequences, while clearly labeling which object kinds are not yet supported for full DDL inspection.

## Requirements

### R1. Unified Object Catalog

The schema snapshot must return tables, views, routines, triggers, and sequences through one host/bridge/backend path.

### R2. Reachable Explorer Sections

The left object explorer must expose dedicated sections for routines, triggers, and sequences in the same dense desktop-style navigation surface.

### R3. Honest Unsupported Flow

When an operator selects an unsupported object kind, the inspection pane must clearly say the object is cataloged but not yet fully inspectable.

### R4. Search Coverage

The explorer filter must match routines, triggers, and sequences in addition to tables and views.

## Acceptance Criteria

1. `DbSchemaSnapshot` includes routines, triggers, and sequences.
2. MySQL and PostgreSQL introspection return the object kinds each driver can enumerate, with empty lists where unsupported.
3. The object explorer shows routines, triggers, and sequences with counts and dense rows.
4. Clicking an unsupported object routes to the inspection pane with an explicit not-yet-implemented message.
5. The existing explorer search filters the expanded object catalog.
