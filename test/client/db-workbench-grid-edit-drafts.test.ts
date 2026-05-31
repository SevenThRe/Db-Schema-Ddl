import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
} from "../../shared/schema";
import {
  addPendingInsertedRow,
  applyPendingEditCell,
  buildGridPatchKey,
  buildPendingGridCommitDrafts,
  discardPendingDeleteRow,
  discardPendingEditCell,
  discardPendingEditRow,
  discardPendingInsertedRow,
  editPendingInsertedRowValue,
  hasPendingGridCommitDrafts,
  removePendingDeleteForEdit,
  stagePendingDeleteRow,
} from "../../client/src/components/extensions/db-workbench/grid-edit-drafts";

function patch(overrides: Partial<DbGridEditPatchCell> = {}): DbGridEditPatchCell {
  return {
    rowPkTuple: "id=1",
    rowPrimaryKey: { id: 1 },
    columnName: "name",
    beforeValue: "Aki",
    nextValue: "Mina",
    ...overrides,
  };
}

function deleteDraft(rowPkTuple = "id=1"): DbGridDeleteRowDraft {
  return {
    rowPkTuple,
    rowPrimaryKey: { id: Number(rowPkTuple.replace("id=", "")) },
  };
}

test("grid edit draft patches preserve original before value and remove no-op changes", () => {
  const first = applyPendingEditCell({}, patch({ nextValue: "Mina" }));
  const changedAgain = applyPendingEditCell(first, patch({ nextValue: "Rin" }));
  const reverted = applyPendingEditCell(changedAgain, patch({ nextValue: "Aki" }));

  assert.equal(buildGridPatchKey("id=1", "name"), "id=1::name");
  assert.equal(changedAgain["id=1::name"]?.beforeValue, "Aki");
  assert.equal(changedAgain["id=1::name"]?.nextValue, "Rin");
  assert.deepEqual(reverted, {});
});

test("grid edit draft row delete and row edit states clear each other deterministically", () => {
  const deleteRows = stagePendingDeleteRow({}, deleteDraft("id=1"));
  const afterEdit = removePendingDeleteForEdit(deleteRows, "id=1");
  assert.deepEqual(afterEdit, {});

  const editCells = {
    "id=1::name": patch({ columnName: "name" }),
    "id=1::status": patch({ columnName: "status", nextValue: "active" }),
    "id=2::name": patch({ rowPkTuple: "id=2", rowPrimaryKey: { id: 2 } }),
  };
  assert.deepEqual(Object.keys(discardPendingEditRow(editCells, "id=1")), [
    "id=2::name",
  ]);
  assert.deepEqual(discardPendingEditCell(editCells, "id=1", "name")["id=1::name"], undefined);
  assert.deepEqual(discardPendingDeleteRow(deleteRows, "id=1"), {});
});

test("grid inserted row drafts support sparse values and explicit removal", () => {
  const withDraft = addPendingInsertedRow({}, "draft-1");
  const withName = editPendingInsertedRowValue(withDraft, "draft-1", "name", "Aki");
  const withNull = editPendingInsertedRowValue(withName, "draft-1", "note", null);
  const removedName = editPendingInsertedRowValue(withNull, "draft-1", "name", undefined);

  assert.deepEqual(removedName["draft-1"]?.values, { note: null });
  assert.deepEqual(discardPendingInsertedRow(removedName, "draft-1"), {});
});

test("grid commit drafts filter empty insert drafts and expose pending-state predicate", () => {
  const drafts = buildPendingGridCommitDrafts(
    {
      "id=1::name": patch(),
      "id=1::name-copy": patch(),
    },
    {
      "id=2": deleteDraft("id=2"),
    },
    {
      "draft-empty": { rowDraftId: "draft-empty", values: {} },
      "draft-filled": { rowDraftId: "draft-filled", values: { name: "Aki" } },
    },
  );

  assert.equal(drafts.patchCells.length, 1);
  assert.equal(drafts.deletedRows.length, 1);
  assert.deepEqual(drafts.insertedRows, [
    { rowDraftId: "draft-filled", values: { name: "Aki" } },
  ]);
  assert.equal(hasPendingGridCommitDrafts(drafts), true);
  assert.equal(
    hasPendingGridCommitDrafts({ patchCells: [], deletedRows: [], insertedRows: [] }),
    false,
  );
});
