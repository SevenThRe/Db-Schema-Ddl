# Spec: Grid Row Delete

## Problem

The DB Workbench result grid supports staged cell edits and transactional commit review, but it still cannot stage and commit row deletes from the same operator surface. That leaves a common day-to-day database-tool workflow missing from the grid editing loop.

## Goal

Allow operators to stage row deletes in the result grid and commit them through the same prepare/commit safety flow already used for cell edits.

## Requirements

### R1. Same Safe Commit Loop

Row delete must go through the existing prepare/commit review flow rather than executing immediately.

### R2. Primary-Key Scoped Delete

Delete staging must only be available when the current grid batch has a stable primary-key mapping.

### R3. Revertable Draft State

Operators must be able to stage a row delete, see that draft state in the grid, and revert it before commit.

### R4. Shared Transaction Boundary

If a commit contains row deletes, they must execute inside the same transactional backend plan system used for other grid mutations.

## Acceptance Criteria

1. Shared contracts and backend grid commit flow support staged row delete mutations.
2. The result grid can stage and revert row deletes from the current batch.
3. Prepare commit shows pending row deletes in the same review dialog before commit.
4. `npm run check` and `cargo check` continue to pass.
