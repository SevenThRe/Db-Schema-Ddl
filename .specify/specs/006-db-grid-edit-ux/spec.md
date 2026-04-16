# Spec: Grid Edit Dirty-State UX

## Problem

The DB Workbench can collect editable row patches and prepare transactional commits, but the result grid still renders original values after a cell edit. Operators can see the pending edit count, yet they cannot verify which rows changed, what the staged values are, or whether the selected-row inspector reflects the pending state. That breaks trust in the editing workflow and falls short of industry-standard DB tools.

## Goal

Make pending row edits visible directly inside the result grid so operators can review staged values and dirty cells before preparing a commit, without changing the backend grid-edit contract.

## Requirements

### R1. Pending Value Overlay

Edited cells must render their staged `nextValue` in the result grid and row inspector instead of the original loaded value.

### R2. Dirty-State Highlighting

Rows and cells with staged edits must be visually distinct so operators can quickly identify what will be committed.

### R3. Stable Multi-Edit Semantics

Editing the same cell multiple times before commit must preserve the original `beforeValue` so reverting to the original database value removes the pending patch cleanly.

### R4. Filter And Copy Consistency

Filtering, row copy actions, and row inspection must operate on the staged effective values rather than stale originals.

## Acceptance Criteria

1. After editing a cell, the grid immediately shows the staged value without waiting for commit.
2. Dirty cells are visibly highlighted, and dirty rows remain identifiable while browsing.
3. Re-editing a staged cell and changing it back to the original value removes the patch from the pending-edit set.
4. The row inspector and copy actions reflect staged values for edited rows.
5. No Rust or shared-schema contract changes are required for this wave.
