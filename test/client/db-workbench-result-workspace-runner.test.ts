import test from "node:test";
import assert from "node:assert/strict";
import type { SetStateAction } from "react";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  QueryExecutionResponse,
} from "../../shared/schema";
import {
  createResultWorkspaceStateActions,
  getActiveBatch,
  resolveActiveBatchIndex,
  runClearGridDraftsForResultContext,
  runClearResultWindowCapNotices,
  runRepairActiveBatchIndex,
} from "../../client/src/components/extensions/db-workbench/result-workspace-runner";

function results(batchCount: number): QueryExecutionResponse {
  return {
    requestId: "request-1",
    connectionId: "conn-1",
    sql: "select 1",
    schema: null,
    executionTimeMs: 1,
    affectedRows: null,
    warnings: [],
    batches: Array.from({ length: batchCount }, (_, index) => ({
      statementIndex: index,
      statementSql: `select ${index}`,
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: null,
      error: null,
      executionTimeMs: 1,
    })),
  };
}

function applyState<T>(current: T, action: SetStateAction<T>): T {
  return typeof action === "function" ? (action as (value: T) => T)(current) : action;
}

test("result workspace runner resolves active batch index bounds", () => {
  assert.equal(resolveActiveBatchIndex({ results: null, activeBatchIndex: 3 }), 0);
  assert.equal(
    resolveActiveBatchIndex({ results: results(3), activeBatchIndex: 1 }),
    1,
  );
  assert.equal(
    resolveActiveBatchIndex({ results: results(3), activeBatchIndex: 9 }),
    2,
  );
});

test("result workspace runner repairs active batch index only when needed", () => {
  let activeBatchIndex = 9;
  const changed = runRepairActiveBatchIndex({
    results: results(2),
    activeBatchIndex,
    setActiveBatchIndex: (index) => {
      activeBatchIndex = index;
    },
  });

  assert.equal(changed, true);
  assert.equal(activeBatchIndex, 1);

  const unchanged = runRepairActiveBatchIndex({
    results: results(2),
    activeBatchIndex,
    setActiveBatchIndex: () => assert.fail("valid active index should not change"),
  });
  assert.equal(unchanged, false);
});

test("result workspace runner clears pending grid drafts for result context changes", () => {
  let editCells: Record<string, DbGridEditPatchCell> = {
    row1: {} as never,
  };
  let deleteRows: Record<string, DbGridDeleteRowDraft> = {
    row1: {} as never,
  };
  let insertedRows: Record<string, DbGridInsertedRowDraft> = {
    row1: {} as never,
  };
  let preparedPlan: DbGridPrepareCommitResponse | null = {} as never;
  let activeBatchIndex = 1;

  const actions = createResultWorkspaceStateActions({
    setResultTab: () => undefined,
    setResults: () => undefined,
    setQueryError: () => undefined,
    setActiveBatchIndex: (index) => {
      activeBatchIndex = index;
    },
    setPendingEditCells: (action) => {
      editCells = applyState(editCells, action);
    },
    setPendingDeleteRows: (action) => {
      deleteRows = applyState(deleteRows, action);
    },
    setPendingInsertedRows: (action) => {
      insertedRows = applyState(insertedRows, action);
    },
    setPreparedGridPlan: (action) => {
      preparedPlan = applyState(preparedPlan, action);
    },
    clearShownWindowCapNotices: () => undefined,
  });

  runClearGridDraftsForResultContext(actions);

  assert.equal(activeBatchIndex, 1);
  assert.deepEqual(editCells, {});
  assert.deepEqual(deleteRows, {});
  assert.deepEqual(insertedRows, {});
  assert.equal(preparedPlan, null);
});

test("result workspace runner clears result window cap notices for result context changes", () => {
  const shownBatchIndexes = new Set([0, 2]);

  runClearResultWindowCapNotices(
    createResultWorkspaceStateActions({
      setResultTab: () => undefined,
      setResults: () => undefined,
      setQueryError: () => undefined,
      setActiveBatchIndex: () => undefined,
      setPendingEditCells: () => undefined,
      setPendingDeleteRows: () => undefined,
      setPendingInsertedRows: () => undefined,
      setPreparedGridPlan: () => undefined,
      clearShownWindowCapNotices: () => shownBatchIndexes.clear(),
    }),
  );

  assert.equal(shownBatchIndexes.size, 0);
});

test("result workspace runner creates reusable state action objects", () => {
  let activeBatchIndex = 0;
  let editCells: Record<string, DbGridEditPatchCell> = {
    row1: {} as never,
  };
  let deleteRows: Record<string, DbGridDeleteRowDraft> = {
    row1: {} as never,
  };
  let insertedRows: Record<string, DbGridInsertedRowDraft> = {
    row1: {} as never,
  };
  let preparedPlan: DbGridPrepareCommitResponse | null = {} as never;
  const shownBatchIndexes = new Set([3]);
  const selectedTabs: string[] = [];
  let currentResults: QueryExecutionResponse | null = results(1);
  let queryError: string | null = "syntax error";

  const actions = createResultWorkspaceStateActions({
    setResultTab: (tab) => selectedTabs.push(tab),
    setResults: (nextResults) => {
      currentResults = nextResults;
    },
    setQueryError: (message) => {
      queryError = message;
    },
    setActiveBatchIndex: (index) => {
      activeBatchIndex = index;
    },
    setPendingEditCells: (action) => {
      editCells = applyState(editCells, action);
    },
    setPendingDeleteRows: (action) => {
      deleteRows = applyState(deleteRows, action);
    },
    setPendingInsertedRows: (action) => {
      insertedRows = applyState(insertedRows, action);
    },
    setPreparedGridPlan: (action) => {
      preparedPlan = applyState(preparedPlan, action);
    },
    clearShownWindowCapNotices: () => shownBatchIndexes.clear(),
  });

  actions.selectResultTab("schema-diff");
  actions.selectResultsTab();
  actions.setActiveBatchIndex(2);
  actions.resetActiveBatchIndex();
  actions.clearResults();
  actions.clearQueryError();
  actions.clearGridDrafts();
  actions.clearResultWindowCapNotices();

  assert.deepEqual(selectedTabs, ["schema-diff", "results"]);
  assert.equal(activeBatchIndex, 0);
  assert.equal(currentResults, null);
  assert.equal(queryError, null);
  assert.deepEqual(editCells, {});
  assert.deepEqual(deleteRows, {});
  assert.deepEqual(insertedRows, {});
  assert.equal(preparedPlan, null);
  assert.equal(shownBatchIndexes.size, 0);
});

test("result workspace runner returns active batch with clamped index", () => {
  const response = results(2);

  assert.equal(getActiveBatch({ results: null, activeBatchIndex: 0 }), undefined);
  assert.equal(
    getActiveBatch({ results: response, activeBatchIndex: 0 })?.statementIndex,
    0,
  );
  assert.equal(
    getActiveBatch({ results: response, activeBatchIndex: 9 })?.statementIndex,
    1,
  );
});
