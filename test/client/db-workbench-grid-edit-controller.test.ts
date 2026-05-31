import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbGridCommitRequest,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
} from "../../shared/schema";
import {
  createWorkbenchGridEditController,
} from "../../client/src/components/extensions/db-workbench/workbench-grid-edit-controller";
import type {
  PendingDeleteRows,
  PendingEditCells,
  PendingInsertedRows,
} from "../../client/src/components/extensions/db-workbench/grid-edit-drafts";

function batch(): DbQueryBatchResult {
  return {
    sql: "select id, name from users",
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    rows: [{ values: [1, "Aki"] }],
    totalRows: 1,
    returnedRows: 1,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 3,
    editEligibility: { eligible: true, reasons: [] },
    editSource: {
      kind: "starter-select",
      tableName: "users",
      schema: "public",
      queryMode: "select",
    },
    primaryKeyColumns: ["id"],
  };
}

function patch(): DbGridEditPatchCell {
  return {
    rowPkTuple: "id=1",
    rowPrimaryKey: { id: 1 },
    columnName: "name",
    beforeValue: "Aki",
    nextValue: "Mina",
  };
}

function deleteDraft(rowId = 1): DbGridDeleteRowDraft {
  return {
    rowPkTuple: `id=${rowId}`,
    rowPrimaryKey: { id: rowId },
  };
}

function prepared(): DbGridPrepareCommitResponse {
  return {
    planId: "plan-1",
    planHash: "hash-1",
    affectedRows: 1,
    insertedRows: 1,
    updatedRows: 1,
    deletedRows: 0,
    changedColumnsSummary: ["name"],
    sqlPreviewLines: ["UPDATE users SET name = ? WHERE id = ?"],
    previewTruncated: false,
  };
}

test("workbench grid edit controller centralizes draft, prepare, and commit commands", async () => {
  const events: string[] = [];
  const prepareRequests: DbGridPrepareCommitRequest[] = [];
  const commitRequests: DbGridCommitRequest[] = [];
  let edits: PendingEditCells = {};
  let deletes: PendingDeleteRows = {};
  let inserts: PendingInsertedRows = {};
  let preparedPlanClears = 0;

  const draftActions = {
    updateEditCells: (updater: (previous: PendingEditCells) => PendingEditCells) => {
      edits = updater(edits);
    },
    updateDeleteRows: (updater: (previous: PendingDeleteRows) => PendingDeleteRows) => {
      deletes = updater(deletes);
    },
    updateInsertedRows: (
      updater: (previous: PendingInsertedRows) => PendingInsertedRows,
    ) => {
      inserts = updater(inserts);
    },
    clearPreparedPlan: () => {
      preparedPlanClears += 1;
    },
  };
  const commitActions = {
    beginPrepare: () => events.push("prepare:begin"),
    applyPreparedPlan: (plan: DbGridPrepareCommitResponse) =>
      events.push(`prepare:plan:${plan.planId}`),
    finishPrepare: () => events.push("prepare:finish"),
    beginCommit: () => events.push("commit:begin"),
    clearPreparedPlan: () => events.push("commit:clear-plan"),
    clearDrafts: () => events.push("commit:clear-drafts"),
    finishCommit: () => events.push("commit:finish"),
  };

  const controller = createWorkbenchGridEditController({
    connectionId: "conn-1",
    runtimeSchema: "public",
    activeBatch: batch(),
    fallbackSource: null,
    pendingEditCells: {
      "id=1::name": patch(),
    },
    pendingDeleteRows: {},
    pendingInsertedRows: {
      "draft-existing": { rowDraftId: "draft-existing", values: { name: "Nora" } },
    },
    preparedPlan: prepared(),
    isCommitting: false,
    selectedTableName: "users",
    draftActions,
    commitActions,
    createInsertedRowDraftId: () => "draft-1",
    prepareGridCommit: async (request) => {
      prepareRequests.push(request);
      return prepared();
    },
    commitGridEdits: async (request) => {
      commitRequests.push(request);
      return {
        planId: "plan-1",
        planHash: "hash-1",
        committedRows: 1,
        insertedRows: 0,
        updatedRows: 1,
        deletedRows: 0,
      };
    },
    refreshTable: async (tableName) => events.push(`refresh:${tableName}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  controller.handleEditCell(patch());
  controller.handleAddInsertedGridRow();
  controller.handleEditInsertedGridRowValue("draft-1", "name", "Aki");
  controller.handleStageDeleteGridRow(deleteDraft(2));
  controller.handleRevertGridDelete("id=2");
  controller.handleDiscardInsertedGridRow("draft-1");
  await controller.handlePrepareGridCommit();
  await controller.handleCommitGridEdits();

  assert.equal(edits["id=1::name"]?.nextValue, "Mina");
  assert.deepEqual(deletes, {});
  assert.equal(inserts["draft-1"], undefined);
  assert.ok(preparedPlanClears >= 6);
  assert.equal(prepareRequests[0]?.connectionId, "conn-1");
  assert.equal(prepareRequests[0]?.schema, "public");
  assert.equal(prepareRequests[0]?.insertedRows.length, 1);
  assert.deepEqual(commitRequests, [
    {
      connectionId: "conn-1",
      planId: "plan-1",
      planHash: "hash-1",
    },
  ]);
  assert.ok(events.includes("prepare:begin"));
  assert.ok(events.includes("notice:Commit plan prepared"));
  assert.ok(events.includes("commit:clear-drafts"));
  assert.ok(events.includes("refresh:users"));
});
