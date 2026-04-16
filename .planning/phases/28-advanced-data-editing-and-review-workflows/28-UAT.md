---
status: testing
phase: 28-advanced-data-editing-and-review-workflows
source: 28-01-SUMMARY.md
started: 2026-04-12T17:35:00+08:00
updated: 2026-04-12T20:30:00+08:00
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Stage Delete From Row Inspector
expected: |
  Open an editable table result in Database Workspace. Select any loaded row.
  In the Row Inspector, clicking "Stage delete" should immediately mark that row as pending delete.
  The selected row should show pending-delete state, the footer should show one delete staged,
  and the pending summary area should include a "Pending row deletes" entry for that row.
awaiting: user response

## Tests

### 1. Stage Delete From Row Inspector
expected: Open an editable table result, select a row, click "Stage delete", and see pending-delete state in row inspector, footer, and pending summary.
result: [pending]

### 2. Revert Delete From Row Inspector
expected: For a row already staged for delete, clicking "Revert delete" should remove the pending-delete marker and remove that row from pending delete summary/counts.
result: [pending]

### 3. Mixed Update And Delete Review
expected: Stage one cell edit on one row and one delete on another row, then click "Prepare commit". The review dialog should show both the pending row update details and the pending row delete list together.
result: [pending]

### 4. Commit Mixed Pending Changes
expected: After confirming a prepared mixed edit/delete plan, the commit should succeed, pending local state should clear, and the active table query should refresh so the deleted row no longer appears in the refreshed result.
result: [pending]

### 5. Keep Staged Delete While Browsing More Rows
expected: If the current result supports "Load more", a row staged for delete should remain staged after loading more rows. Its pending-delete state and summary entry should not disappear just because more rows were appended.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0

## Automated Verification

- `npm run verify:desktop:preflight` -> pass
- `npm run check` -> pass
- `node --test --experimental-strip-types test\\client\\db-workbench-grid-delete-phase28.test.ts test\\server\\db-workbench-grid-delete-phase28.test.ts` -> pass
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1` -> pass with existing warnings only
- `node --import=tsx script/run-whitebox-tests.ts` -> fail before Phase 28 assertions because legacy `test/server/ddl-validation.test.ts` still imports removed path `../../server/lib/ddl-validation`

## Gaps

- Real dev-tauri automation now exists. `verify:desktop:smoke` launches the desktop shell and waits for runtime checkpoints; latest smoke artifact passed.
- `verify:desktop:live` now launches the desktop shell and consumes real workbench flow checkpoints, but the latest MySQL run stopped early because this environment did not have a saved MySQL connection available for live verification.
- The general whitebox suite is not green because at least one legacy test still points at the removed `server/lib/*` tree.
