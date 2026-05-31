import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbGridCommitRequest,
  DbGridCommitResponse,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
} from "../../shared/schema";
import {
  createGridCommitStateActions,
  runApplyPreparedGridCommitPlanState,
  runBeginGridCommitApplyState,
  runBeginGridCommitPrepareState,
  runClearGridCommitDraftState,
  runClearPreparedGridCommitPlanState,
  runCommitGridEdits,
  runFinishGridCommitApplyState,
  runFinishGridCommitPrepareState,
  runPrepareGridCommit,
} from "../../client/src/components/extensions/db-workbench/grid-commit-runner";

function batch(overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
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
    ...overrides,
  };
}

function prepared(): DbGridPrepareCommitResponse {
  return {
    planId: "plan-1",
    planHash: "hash-1",
    affectedRows: 1,
    insertedRows: 0,
    updatedRows: 1,
    deletedRows: 0,
    changedColumnsSummary: ["name"],
    sqlPreviewLines: ["UPDATE users SET name = ? WHERE id = ?"],
    previewTruncated: false,
  };
}

function commit(overrides: Partial<DbGridCommitResponse> = {}): DbGridCommitResponse {
  return {
    planId: "plan-1",
    planHash: "hash-1",
    committedRows: 1,
    insertedRows: 0,
    updatedRows: 1,
    deletedRows: 0,
    ...overrides,
  };
}

test("grid commit runner prepares a safe commit plan from pending drafts", async () => {
  const requests: DbGridPrepareCommitRequest[] = [];
  const events: string[] = [];

  const result = await runPrepareGridCommit({
    connectionId: "conn-1",
    runtimeSchema: "public",
    activeBatch: batch(),
    fallbackSource: null,
    pendingEditCells: {
      "id=1::name": {
        rowPrimaryKey: { id: 1 },
        rowPkTuple: "id=1",
        columnName: "name",
        beforeValue: "Aki",
        nextValue: "Mina",
      },
    },
    pendingDeleteRows: {},
    pendingInsertedRows: {},
    prepareGridCommit: async (request) => {
      requests.push(request);
      events.push("prepare");
      return prepared();
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    beginPrepare: () => events.push("begin"),
    applyPreparedPlan: (plan) => events.push(`plan:${plan.planId}`),
    finishPrepare: () => events.push("finish"),
  });

  assert.equal(result?.planId, "plan-1");
  assert.deepEqual(requests[0], {
    connectionId: "conn-1",
    schema: "public",
    tableName: "users",
    source: {
      kind: "starter-select",
      tableName: "users",
      schema: "public",
      queryMode: "select",
    },
    primaryKeyColumns: ["id"],
    patchCells: [
      {
        rowPrimaryKey: { id: 1 },
        rowPkTuple: "id=1",
        columnName: "name",
        beforeValue: "Aki",
        nextValue: "Mina",
      },
    ],
    deletedRows: [],
    insertedRows: [],
  });
  assert.deepEqual(events, [
    "begin",
    "prepare",
    "plan:plan-1",
    "notice:Commit plan prepared",
    "finish",
  ]);
});

test("grid commit runner reports prepare blockers before backend calls", async () => {
  const events: string[] = [];

  const result = await runPrepareGridCommit({
    connectionId: "conn-1",
    runtimeSchema: "public",
    activeBatch: batch(),
    fallbackSource: null,
    pendingEditCells: {},
    pendingDeleteRows: {},
    pendingInsertedRows: {},
    prepareGridCommit: async () => assert.fail("prepareGridCommit should not run"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    beginPrepare: () => assert.fail("beginPrepare should not run"),
    applyPreparedPlan: () => assert.fail("applyPreparedPlan should not run"),
    finishPrepare: () => assert.fail("finishPrepare should not run"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, ["notice:No pending changes"]);
});

test("grid commit runner centralizes prepare and commit UI state", () => {
  const events: string[] = [];
  const plan = prepared();

  runBeginGridCommitPrepareState({
    setIsPreparing: (isPreparing) => events.push(`preparing:${isPreparing}`),
  });
  runApplyPreparedGridCommitPlanState({
    preparedPlan: plan,
    setPreparedPlan: (preparedPlan) => events.push(`plan:${preparedPlan.planId}`),
  });
  runFinishGridCommitPrepareState({
    setIsPreparing: (isPreparing) => events.push(`preparing:${isPreparing}`),
  });
  runBeginGridCommitApplyState({
    setIsCommitting: (isCommitting) => events.push(`committing:${isCommitting}`),
  });
  runClearGridCommitDraftState({
    clearDrafts: () => events.push("drafts:{}"),
  });
  runClearPreparedGridCommitPlanState({
    setPreparedPlan: (preparedPlan) => events.push(`plan:${preparedPlan ?? "null"}`),
  });
  runFinishGridCommitApplyState({
    setIsCommitting: (isCommitting) => events.push(`committing:${isCommitting}`),
  });

  assert.deepEqual(events, [
    "preparing:true",
    "plan:plan-1",
    "preparing:false",
    "committing:true",
    "drafts:{}",
    "plan:null",
    "committing:false",
  ]);
});

test("grid commit runner creates reusable state action objects", () => {
  const events: string[] = [];
  const actions = createGridCommitStateActions({
    setIsPreparing: (isPreparing) => events.push(`preparing:${isPreparing}`),
    setPreparedPlan: (preparedPlan) => events.push(`plan:${preparedPlan?.planId ?? "null"}`),
    setIsCommitting: (isCommitting) => events.push(`committing:${isCommitting}`),
    clearDrafts: () => events.push("drafts:{}"),
  });

  actions.beginPrepare();
  actions.applyPreparedPlan(prepared());
  actions.finishPrepare();
  actions.beginCommit();
  actions.clearDrafts();
  actions.clearPreparedPlan();
  actions.finishCommit();

  assert.deepEqual(events, [
    "preparing:true",
    "plan:plan-1",
    "preparing:false",
    "committing:true",
    "drafts:{}",
    "plan:null",
    "committing:false",
  ]);
});

test("grid commit runner commits, clears drafts, refreshes table, and notifies", async () => {
  const requests: DbGridCommitRequest[] = [];
  const events: string[] = [];

  const result = await runCommitGridEdits({
    connectionId: "conn-1",
    preparedPlan: prepared(),
    isCommitting: false,
    selectedTableName: "users",
    commitGridEdits: async (request) => {
      requests.push(request);
      events.push("commit");
      return commit();
    },
    refreshTable: async (tableName) => events.push(`refresh:${tableName}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    beginCommit: () => events.push("begin"),
    clearPreparedPlan: () => events.push("clear-plan"),
    clearDrafts: () => events.push("clear-drafts"),
    finishCommit: () => events.push("finish"),
  });

  assert.equal(result?.committedRows, 1);
  assert.deepEqual(requests, [
    {
      connectionId: "conn-1",
      planId: "plan-1",
      planHash: "hash-1",
    },
  ]);
  assert.deepEqual(events, [
    "begin",
    "commit",
    "clear-drafts",
    "clear-plan",
    "refresh:users",
    "notice:Commit applied",
    "finish",
  ]);
});

test("grid commit runner preserves drafts on rollback and formats failures", async () => {
  const rollbackEvents: string[] = [];
  const rolledBack = await runCommitGridEdits({
    connectionId: "conn-1",
    preparedPlan: prepared(),
    isCommitting: false,
    selectedTableName: "users",
    commitGridEdits: async () => commit({ failedSqlIndex: 0, message: "bad row" }),
    refreshTable: async () => assert.fail("refreshTable should not run"),
    showNotification: (notice) => rollbackEvents.push(`notice:${notice.title}:${notice.description}`),
    beginCommit: () => rollbackEvents.push("begin"),
    clearPreparedPlan: () => rollbackEvents.push("clear-plan"),
    clearDrafts: () => assert.fail("clearDrafts should not run"),
    finishCommit: () => rollbackEvents.push("finish"),
  });

  const failureEvents: string[] = [];
  const failed = await runCommitGridEdits({
    connectionId: "conn-1",
    preparedPlan: prepared(),
    isCommitting: false,
    selectedTableName: "users",
    commitGridEdits: async () => {
      throw new Error("Error invoking commit: denied");
    },
    refreshTable: async () => assert.fail("refreshTable should not run"),
    showNotification: (notice) => failureEvents.push(`notice:${notice.title}:${notice.description}`),
    beginCommit: () => failureEvents.push("begin"),
    clearPreparedPlan: () => assert.fail("clearPreparedPlan should not run"),
    clearDrafts: () => assert.fail("clearDrafts should not run"),
    finishCommit: () => failureEvents.push("finish"),
  });

  assert.equal(rolledBack?.failedSqlIndex, 0);
  assert.deepEqual(rollbackEvents, [
    "begin",
    "notice:Commit rolled back:bad row",
    "clear-plan",
    "finish",
  ]);
  assert.equal(failed, null);
  assert.deepEqual(failureEvents, [
    "begin",
    "notice:Commit failed:denied",
    "finish",
  ]);
});
