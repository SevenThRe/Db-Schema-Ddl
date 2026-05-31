import test from "node:test";
import assert from "node:assert/strict";
import { createQueryWorkspaceResetState } from "../../client/src/components/extensions/db-workbench/workbench-reset-runtime";

test("reset runtime defines the query workspace state cleared by schema switches", () => {
  assert.deepEqual(createQueryWorkspaceResetState(), {
    results: null,
    explainPlan: null,
    queryError: null,
    explainError: null,
    activeBatchIndex: 0,
    resultTab: "results",
    pendingEditCells: {},
    pendingDeleteRows: {},
    pendingInsertedRows: {},
    preparedGridPlan: null,
    lastGridEditSource: null,
  });
});
