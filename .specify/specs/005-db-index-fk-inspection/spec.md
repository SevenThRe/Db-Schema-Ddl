# Spec: Standalone Inspection For Indexes And Foreign Keys

## Problem

The DB Workbench can now inspect tables, views, routines, triggers, and sequences, but indexes and foreign keys are still browse-only rows nested under tables. Industry-standard DB tools let operators inspect these constraint objects directly.

## Goal

Make nested index and foreign key rows first-class inspection targets so operators can open generated DDL and focused metadata without leaving the object explorer.

## Requirements

### R1. Clickable Nested Objects

Indexes and foreign keys under each table must be directly clickable from the object explorer.

### R2. DDL-First Inspection

The inspection pane must show generated DDL for indexes and foreign keys using existing table snapshot metadata rather than introducing new catalog-query paths.

### R3. Deterministic Parent Context

Inspection requests for indexes and foreign keys must carry parent table context so same-name objects in different tables resolve correctly.

### R4. Accurate Coverage Messaging

The explorer and inspection pane must reflect that indexes and foreign keys are now supported inspection targets.

## Acceptance Criteria

1. Clicking an index row opens the inspection pane with generated index DDL.
2. Clicking a foreign key row opens the inspection pane with generated constraint DDL.
3. The backend resolves index and foreign key inspection by table snapshot and parent table context.
4. No new MySQL/PostgreSQL catalog queries are required for this wave.
