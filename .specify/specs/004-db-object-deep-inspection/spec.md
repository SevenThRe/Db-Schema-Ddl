# Spec: Deep Inspection For Cataloged DB Objects

## Problem

The DB Workbench can now catalog routines, triggers, and sequences, but operators still cannot inspect their definitions from the workbench. That leaves the object explorer short of industry-standard DB tools, where cataloged objects are usually directly inspectable.

## Goal

Extend object inspection so cataloged routines, triggers, and sequences can return real definitions when the driver supports them, while preserving honest unsupported messaging for object kinds that still remain out of scope.

## Requirements

### R1. Routine Inspection

Functions and procedures must open the inspection pane with real DDL or definition text for MySQL and PostgreSQL.

### R2. Trigger Inspection

Triggers must be inspectable from the object explorer, including PostgreSQL cases where trigger names need table context to disambiguate the target.

### R3. Sequence Inspection

PostgreSQL sequences must open in the inspection pane with a generated DDL view based on live sequence metadata.

### R4. Honest Coverage Messaging

Coverage notes and empty-state copy must reflect the expanded support set and keep unsupported object kinds explicit.

## Acceptance Criteria

1. Clicking a routine in the explorer opens the inspection pane with real definition text instead of the current unsupported state.
2. Clicking a trigger in the explorer resolves the intended trigger deterministically and shows its definition text.
3. Clicking a PostgreSQL sequence in the explorer shows generated sequence DDL in the inspection pane.
4. The inspection pane and backend coverage notes no longer claim that routines, triggers, and sequences are unsupported.
5. Remaining unsupported kinds such as indexes and foreign keys still report explicit unsupported messaging.
