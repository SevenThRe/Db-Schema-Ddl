import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
} from "../../shared/schema";
import {
  createGridEditDraftStateActions,
  runAddInsertedGridRowDraft,
  runDiscardGridEditDrafts,
  runDiscardInsertedGridRowDraft,
  runEditGridCellDraft,
  runEditInsertedGridRowDraft,
  runRevertGridCellDraft,
  runRevertGridDeleteDraft,
  runRevertGridRowDraft,
  runStageDeleteGridRowDraft,
  type GridEditDraftActions,
} from "../../client/src/components/extensions/db-workbench/grid-edit-draft-runner";
import type {
  PendingDeleteRows,
  PendingEditCells,
  PendingInsertedRows,
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

function draftHarness(initial?: {
  edits?: PendingEditCells;
  deletes?: PendingDeleteRows;
  inserts?: PendingInsertedRows;
}) {
  let edits = initial?.edits ?? {};
  let deletes = initial?.deletes ?? {};
  let inserts = initial?.inserts ?? {};
  let preparedPlanCleared = 0;

  const actions: GridEditDraftActions = {
    updateEditCells: (updater) => {
      edits = updater(edits);
    },
    updateDeleteRows: (updater) => {
      deletes = updater(deletes);
    },
    updateInsertedRows: (updater) => {
      inserts = updater(inserts);
    },
    clearPreparedPlan: () => {
      preparedPlanCleared += 1;
    },
  };

  return {
    actions,
    state: () => ({ edits, deletes, inserts, preparedPlanCleared }),
  };
}

test("grid edit draft runner edits cells and clears staged delete for the same row", () => {
  const harness = draftHarness({
    deletes: {
      "id=1": deleteDraft("id=1"),
    },
  });

  runEditGridCellDraft(harness.actions, patch());

  assert.deepEqual(harness.state().deletes, {});
  assert.equal(harness.state().edits["id=1::name"]?.nextValue, "Mina");
  assert.equal(harness.state().preparedPlanCleared, 1);
});

test("grid edit draft runner stages delete and clears pending edits for that row", () => {
  const harness = draftHarness({
    edits: {
      "id=1::name": patch({ columnName: "name" }),
      "id=1::status": patch({ columnName: "status", nextValue: "active" }),
      "id=2::name": patch({ rowPkTuple: "id=2", rowPrimaryKey: { id: 2 } }),
    },
  });

  runStageDeleteGridRowDraft(harness.actions, deleteDraft("id=1"));

  assert.deepEqual(Object.keys(harness.state().edits), ["id=2::name"]);
  assert.equal(harness.state().deletes["id=1"]?.rowPkTuple, "id=1");
  assert.equal(harness.state().preparedPlanCleared, 1);
});

test("grid edit draft runner adds edits and discards inserted row drafts", () => {
  const harness = draftHarness();

  runAddInsertedGridRowDraft(harness.actions, "draft-1");
  runEditInsertedGridRowDraft(harness.actions, "draft-1", "name", "Aki");
  runEditInsertedGridRowDraft(harness.actions, "draft-1", "note", null);
  runEditInsertedGridRowDraft(harness.actions, "draft-1", "name", undefined);

  assert.deepEqual(harness.state().inserts["draft-1"]?.values, { note: null });

  runDiscardInsertedGridRowDraft(harness.actions, "draft-1");

  assert.deepEqual(harness.state().inserts, {});
  assert.equal(harness.state().preparedPlanCleared, 5);
});

test("grid edit draft runner reverts cells rows and staged deletes", () => {
  const harness = draftHarness({
    edits: {
      "id=1::name": patch({ columnName: "name" }),
      "id=1::status": patch({ columnName: "status", nextValue: "active" }),
    },
    deletes: {
      "id=1": deleteDraft("id=1"),
    },
  });

  runRevertGridCellDraft(harness.actions, "id=1", "name");
  assert.deepEqual(Object.keys(harness.state().edits), ["id=1::status"]);

  runRevertGridRowDraft(harness.actions, "id=1");
  assert.deepEqual(harness.state().edits, {});
  assert.deepEqual(harness.state().deletes, {});

  runStageDeleteGridRowDraft(harness.actions, deleteDraft("id=1"));
  runRevertGridDeleteDraft(harness.actions, "id=1");
  assert.deepEqual(harness.state().deletes, {});
  assert.equal(harness.state().preparedPlanCleared, 4);
});

test("grid edit draft runner discards all draft families together", () => {
  const harness = draftHarness({
    edits: { "id=1::name": patch() },
    deletes: { "id=2": deleteDraft("id=2") },
    inserts: { "draft-1": { rowDraftId: "draft-1", values: { name: "Aki" } } },
  });

  runDiscardGridEditDrafts(harness.actions);

  assert.deepEqual(harness.state(), {
    edits: {},
    deletes: {},
    inserts: {},
    preparedPlanCleared: 1,
  });
});

test("grid edit draft runner creates reusable state action objects", () => {
  let edits: PendingEditCells = {};
  let deletes: PendingDeleteRows = {};
  let inserts: PendingInsertedRows = {};
  let preparedPlan: "prepared" | null = "prepared";

  const actions = createGridEditDraftStateActions({
    setPendingEditCells: (updater) => {
      edits = updater(edits);
    },
    setPendingDeleteRows: (updater) => {
      deletes = updater(deletes);
    },
    setPendingInsertedRows: (updater) => {
      inserts = updater(inserts);
    },
    setPreparedGridPlan: (nextPlan) => {
      preparedPlan = nextPlan;
    },
  });

  actions.updateEditCells(() => ({ "id=1::name": patch() }));
  actions.updateDeleteRows(() => ({ "id=2": deleteDraft("id=2") }));
  actions.updateInsertedRows(() => ({
    "draft-1": { rowDraftId: "draft-1", values: { name: "Aki" } },
  }));
  actions.clearPreparedPlan();

  assert.deepEqual(Object.keys(edits), ["id=1::name"]);
  assert.deepEqual(Object.keys(deletes), ["id=2"]);
  assert.deepEqual(Object.keys(inserts), ["draft-1"]);
  assert.equal(preparedPlan, null);
});
