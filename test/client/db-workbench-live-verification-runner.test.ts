import test from "node:test";
import assert from "node:assert/strict";

import {
  runWorkbenchLiveVerification,
  type LiveVerificationCompletionStatus,
  type WorkbenchLiveVerificationRunner,
} from "../../client/src/components/extensions/db-workbench/live-verification-runner";
import type {
  DbConnectionConfig,
  DbObjectInspectionResponse,
  DbQueryBatchResult,
  DbSchemaSnapshot,
  QueryExecutionRequest,
} from "../../shared/schema";
import type {
  LiveVerificationFlowId,
  LiveVerificationFlowStatus,
} from "../../client/src/components/extensions/db-workbench/live-verification-runtime";

type FlowRecord = {
  flowId: LiveVerificationFlowId;
  status: LiveVerificationFlowStatus;
  note: string;
};

type CompletionRecord = {
  status: LiveVerificationCompletionStatus;
  note: string;
};

function createConnection(
  overrides: Partial<DbConnectionConfig> = {},
): DbConnectionConfig {
  return {
    id: "conn-1",
    name: "Reporting DB",
    driver: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database: "reporting",
    username: "root",
    password: "secret",
    ...overrides,
  };
}

function createSnapshot(tables = [createTable()]): DbSchemaSnapshot {
  return {
    connectionId: "conn-1",
    connectionName: "Reporting DB",
    database: "reporting",
    schema: "reporting",
    tables,
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

function createTable() {
  return {
    name: "users",
    columns: [
      {
        name: "id",
        dataType: "int",
        nullable: false,
        primaryKey: true,
      },
    ],
    indexes: [],
    foreignKeys: [],
  };
}

function createBatch(
  overrides: Partial<DbQueryBatchResult> = {},
): DbQueryBatchResult {
  return {
    sql: "SELECT * FROM users",
    columns: [{ name: "id", dataType: "int", isPrimaryKey: true }],
    rows: [{ values: [1] }],
    totalRows: null,
    returnedRows: 1,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 1,
    editEligibility: { eligible: false, reasons: [] },
    primaryKeyColumns: ["id"],
    ...overrides,
  };
}

function createInspection(): DbObjectInspectionResponse {
  return {
    connectionId: "conn-1",
    database: "reporting",
    schema: "reporting",
    objectKind: "table",
    objectName: "users",
    displayName: "users",
    supported: true,
    columns: [],
    indexes: [],
    foreignKeys: [],
    coverageNotes: [],
  };
}

function createRunner(overrides: Partial<WorkbenchLiveVerificationRunner> = {}) {
  const flows: FlowRecord[] = [];
  const completions: CompletionRecord[] = [];
  const cancelRequests: QueryExecutionRequest[] = [];
  const defaultRunner: WorkbenchLiveVerificationRunner = {
    emitFlow: async (flowId, status, note) => {
      flows.push({ flowId, status, note });
    },
    complete: async (status, note) => {
      completions.push({ status, note });
    },
    inspectObject: async () => createInspection(),
    updateActiveTabSql: () => undefined,
    setResultTab: () => undefined,
    setLastGridEditSource: () => undefined,
    executeImmediate: async () => ({
      requestId: "query-1",
      batches: [createBatch()],
    }),
    loadMore: async () => createBatch(),
    exportCurrentPage: async () => ({
      fileName: "users.json",
      base64: "",
      mimeType: "application/json",
    }),
    stageDeleteRow: () => undefined,
    prepareGridCommit: async () => null,
    revertGridDelete: () => undefined,
    clearPreparedGridPlan: () => undefined,
    randomRequestId: () => "cancel-1",
    startCancelRequest: () => undefined,
    executeCancelQuery: async (request) => {
      cancelRequests.push(request);
      throw new Error("Query cancelled by request");
    },
    cancelQuery: async () => undefined,
    finishCancelRequest: () => undefined,
    sleep: async () => undefined,
  };

  return {
    runner: { ...defaultRunner, ...overrides },
    flows,
    completions,
    cancelRequests,
  };
}

test("live verification runner stops after schema-load failure and still emits completion", async () => {
  const { runner, flows, completions } = createRunner();

  await runWorkbenchLiveVerification({
    connection: createConnection(),
    schemaSnapshot: null,
    schemaErrorMessage: "login failed",
    runner,
  });

  assert.deepEqual(flows, [
    {
      flowId: "connect",
      status: "failed",
      note: "login failed",
    },
  ]);
  assert.deepEqual(completions, [
    {
      status: "failed",
      note:
        "Live verification stopped before query flows because the connection could not be established.",
    },
  ]);
});
test("live verification runner executes the canonical query/export/cancel journey", async () => {
  const { runner, flows, completions, cancelRequests } = createRunner();

  await runWorkbenchLiveVerification({
    connection: createConnection(),
    schemaSnapshot: createSnapshot(),
    runtimeSchema: "reporting",
    runner,
  });

  assert.deepEqual(
    flows.map((flow) => [flow.flowId, flow.status]),
    [
      ["connect", "passed"],
      ["inspection", "passed"],
      ["query", "passed"],
      ["paging", "warning"],
      ["export", "passed"],
      ["edit", "warning"],
      ["readonly", "warning"],
      ["cancel", "passed"],
    ],
  );
  assert.equal(cancelRequests[0]?.sql, "SELECT SLEEP(8);");
  assert.equal(cancelRequests[0]?.schema, "reporting");
  assert.deepEqual(completions, [
    {
      status: "passed",
      note: "Completed live verification flows for Reporting DB.",
    },
  ]);
});
