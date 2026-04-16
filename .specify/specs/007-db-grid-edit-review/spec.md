# Spec: Grid Edit Review And Revert UX

## Problem

After 006, staged values are visible in the grid, but operators still lack two important review controls before commit: a quick way to revert a single dirty cell or a whole staged row, and a compact row-level summary inside the review flow. Without that, the edit path remains more error-prone than industry-standard DB tools.

## Goal

Add lightweight revert controls and row-level pending-edit summaries so operators can audit and prune staged row edits before preparing or confirming a commit.

## Requirements

### R1. Cell-Level Revert

Operators must be able to revert a dirty field from the selected-row inspector without discarding the full pending-edit set.

### R2. Row-Level Revert

Operators must be able to revert all staged edits for a row from a compact pending-row summary.

### R3. Commit Review Summary

The prepare-commit dialog must include a row-level summary that lists each staged row and its before/after field changes alongside the SQL preview.

### R4. Frontend-Only Delivery

This wave must reuse the current pending patch model and prepare/commit backend contract without introducing shared-schema or Rust command changes.

## Acceptance Criteria

1. Dirty fields in the row inspector show a revert action that removes only that staged patch.
2. A pending-row summary is visible in the grid area and supports reverting an entire row’s staged edits.
3. The commit confirmation dialog lists staged rows and before/after field values before the operator confirms commit.
4. `npm run check` and `cargo check` continue to pass without backend contract changes.
