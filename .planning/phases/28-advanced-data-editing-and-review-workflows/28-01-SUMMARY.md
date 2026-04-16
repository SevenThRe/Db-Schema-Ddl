## 28-01 Summary

Objective completed: staged row deletes now work inside the canonical DB Workbench grid-edit flow.

What landed:

1. `WorkbenchLayout` now tracks `pendingDeleteRows` alongside cell edits.
2. Delete drafts are cleared or preserved consistently across rerun, schema switch, connection switch, batch switch, discard, revert, and commit flows.
3. `prepareGridCommit` now receives both `patchCells` and `deletedRows`.
4. `GridEditCommitDialog` now renders real pending delete review data instead of an empty placeholder.
5. `ResultGridPane` now exposes:
   - `Stage delete` / `Revert delete` actions in the row inspector
   - pending delete row highlighting
   - pending delete summary cards
   - mixed edit/delete footer counts
6. Client-side load-more memory trimming now protects delete-staged rows the same way it protects edit-staged rows.
7. Rust grid commit now fails closed when an UPDATE or DELETE affects anything other than exactly one row.

Validation:

- `npm run check`
- `node --test --experimental-strip-types test/client/db-workbench-grid-delete-phase28.test.ts test/server/db-workbench-grid-delete-phase28.test.ts`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`

Remaining scope for Phase 28:

- inserted-row drafting and commit support
- broader review UX for larger mixed edit sets
- durable draft persistence across reruns/restarts
