import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbGridCommitResponse,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
} from "../../shared/schema";
import {
  buildGridCommitFailureNotice,
  buildGridCommitRequest,
  buildPrepareGridCommitFailureNotice,
  buildPrepareGridCommitRequest,
  buildPrepareGridCommitSuccessNotice,
  resolveGridCommitResultAction,
} from "../../client/src/components/extensions/db-workbench/grid-commit-runtime";

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

function prepared(overrides: Partial<DbGridPrepareCommitResponse> = {}): DbGridPrepareCommitResponse {
  return {
    planId: "plan-1",
    planHash: "hash-1",
    affectedRows: 2,
    insertedRows: 1,
    updatedRows: 1,
    deletedRows: 0,
    changedColumnsSummary: ["name"],
    sqlPreviewLines: ["UPDATE users SET name = ? WHERE id = ?"],
    previewTruncated: false,
    ...overrides,
  };
}

function commit(overrides: Partial<DbGridCommitResponse> = {}): DbGridCommitResponse {
  return {
    planId: "plan-1",
    planHash: "hash-1",
    committedRows: 2,
    insertedRows: 1,
    updatedRows: 1,
    deletedRows: 0,
    ...overrides,
  };
}

const drafts = {
  patchCells: [{
    rowPrimaryKey: { id: 1 },
    rowPkTuple: "id=1",
    columnName: "name",
    beforeValue: "Aki",
    nextValue: "Mina",
  }],
  deletedRows: [],
  insertedRows: [],
};

test("grid commit runtime builds prepare request from editable batch context", () => {
  const result = buildPrepareGridCommitRequest({
    connectionId: "conn-1",
    runtimeSchema: "public",
    activeBatch: batch(),
    fallbackSource: null,
    drafts,
  });

  assert.ok(result.request);
  assert.equal(result.request.connectionId, "conn-1");
  assert.equal(result.request.schema, "public");
  assert.equal(result.request.tableName, "users");
  assert.deepEqual(result.request.primaryKeyColumns, ["id"]);
  assert.equal(result.request.patchCells.length, 1);
});

test("grid commit runtime reports prepare blockers before backend calls", () => {
  assert.deepEqual(
    buildPrepareGridCommitRequest({
      connectionId: "conn-1",
      activeBatch: batch({
        editEligibility: {
          eligible: false,
          reasons: [{ code: "readonly_connection", message: "read-only" }],
        },
      }),
      fallbackSource: null,
      drafts,
    }).notice,
    {
      title: "Cannot prepare commit",
      description: "read-only",
      variant: "destructive",
    },
  );

  assert.deepEqual(
    buildPrepareGridCommitRequest({
      connectionId: "conn-1",
      activeBatch: batch(),
      fallbackSource: null,
      drafts: { patchCells: [], deletedRows: [], insertedRows: [] },
    }).notice,
    {
      title: "No pending changes",
      description: "Stage at least one row edit, insert draft, or delete before preparing commit.",
      variant: "default",
    },
  );
});

test("grid commit runtime centralizes prepare and commit notices", () => {
  assert.deepEqual(buildPrepareGridCommitSuccessNotice(prepared()), {
    title: "Commit plan prepared",
    description: "1 inserts, 1 updates, and 0 deletes ready for review.",
    variant: "success",
  });
  assert.deepEqual(buildPrepareGridCommitFailureNotice("boom"), {
    title: "Prepare commit failed",
    description: "boom",
    variant: "destructive",
  });
  assert.deepEqual(buildGridCommitFailureNotice("boom"), {
    title: "Commit failed",
    description: "boom",
    variant: "destructive",
  });
});

test("grid commit runtime builds commit request and classifies rollback vs success", () => {
  assert.deepEqual(buildGridCommitRequest({
    connectionId: "conn-1",
    preparedPlan: prepared(),
  }), {
    connectionId: "conn-1",
    planId: "plan-1",
    planHash: "hash-1",
  });

  assert.deepEqual(resolveGridCommitResultAction(commit(), true), {
    rolledBack: false,
    clearDrafts: true,
    refreshTable: true,
    notice: {
      title: "Commit applied",
      description: "1 inserts, 1 updates, and 0 deletes committed.",
      variant: "success",
    },
  });

  assert.deepEqual(
    resolveGridCommitResultAction(commit({
      failedSqlIndex: 2,
      message: undefined,
    }), true),
    {
      rolledBack: true,
      clearDrafts: false,
      refreshTable: false,
      notice: {
        title: "Commit rolled back",
        description: "Statement 3 failed and the transaction was rolled back.",
        variant: "destructive",
      },
    },
  );
});
