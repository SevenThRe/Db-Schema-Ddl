import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchQueryExecutionController,
} from "../../client/src/components/extensions/db-workbench/workbench-query-execution-controller";
import type {
  DangerousSqlPreview,
  DbGridEditSource,
  QueryExecutionRequest,
  QueryExecutionResponse,
} from "../../shared/schema";
import type {
  QueryExecutionSessionUpdate,
} from "../../client/src/components/extensions/db-workbench/query-execution-runner";
import type {
  QuerySafetyStateActions,
} from "../../client/src/components/extensions/db-workbench/query-safety-runner";

interface MemoryStorage {
  clear: () => void;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
  length: number;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function installWindowWithStorage(): void {
  Reflect.set(globalThis, "window", { localStorage: createMemoryStorage() });
}

function response(requestId = "query-1"): QueryExecutionResponse {
  return {
    requestId,
    batches: [
      {
        sql: "select id from users",
        columns: [{ name: "id", dataType: "integer" }],
        rows: [{ values: [1] }],
        totalRows: 1,
        returnedRows: 1,
        hasMore: false,
        pagingMode: "none",
        elapsedMs: 10,
      },
    ],
  };
}

function safePreview(): DangerousSqlPreview {
  return {
    sql: "select id from users",
    normalizedSql: "select id from users",
    statementCount: 1,
    dangers: [],
    requiresConfirmation: false,
  };
}

function querySafetyActions(events: string[]): QuerySafetyStateActions {
  return {
    setPendingSql: (sql) => events.push(`pending-sql:${sql ?? "null"}`),
    setPendingCursorOffset: (cursorOffset) =>
      events.push(`cursor:${cursorOffset ?? "none"}`),
    setPendingQuerySource: () => events.push("source"),
    setPendingQueryMode: (mode) => events.push(`mode:${mode}`),
    setShowDangerDialog: (open) => events.push(`danger-open:${open}`),
    clearDangerPreview: () => events.push("danger-clear"),
    clearQueryError: () => events.push("query-error-clear"),
    setDangerPreview: () => events.push("danger-preview"),
    applyParameterReview: () => events.push("parameter-review"),
    applyParameterValues: () => events.push("parameter-values"),
    clearParameterReview: () => events.push("parameter-clear"),
    clearParameterValues: () => events.push("parameter-values-clear"),
    applyScriptReview: () => events.push("script-review"),
    clearScriptReview: () => events.push("script-clear"),
  };
}

test.beforeEach(() => {
  installWindowWithStorage();
});

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("query execution controller executes, decorates editable results, and applies session updates", async () => {
  let activeRequestId: string | null = null;
  const requests: QueryExecutionRequest[] = [];
  const successSessions: QueryExecutionSessionUpdate[] = [];
  const source: DbGridEditSource = {
    kind: "starter-select",
    tableName: "users",
    schema: "app",
  };

  const controller = createWorkbenchQueryExecutionController({
    connectionId: "conn-1",
    readonlyConnection: false,
    runtimeSchema: "app",
    schemaTables: [
      {
        name: "users",
        columns: [
          {
            name: "id",
            dataType: "integer",
            nullable: false,
            primaryKey: true,
          },
        ],
      },
    ],
    stopOnError: true,
    isExecuting: false,
    isExporting: false,
    createRequestId: () => "query-1",
    getActiveQueryRequestId: () => activeRequestId,
    queryExecutionActions: {
      startRequest: (requestId) => {
        activeRequestId = requestId;
      },
      applySuccess: ({ decoratedResponse, session }) => {
        successSessions.push(session);
        assert.deepEqual(decoratedResponse.batches[0]?.primaryKeyColumns, ["id"]);
        assert.equal(decoratedResponse.batches[0]?.editEligibility?.eligible, true);
      },
      applyFailure: () => assert.fail("failure path should not run"),
      finishRequest: (requestId) => {
        assert.equal(requestId, "query-1");
        activeRequestId = null;
      },
    },
    querySafetyActions: querySafetyActions([]),
    executeQuery: async (request) => {
      requests.push(request);
      return response(request.requestId);
    },
    previewDangerousSql: async () => assert.fail("preview should not run"),
  });

  const result = await controller.executeImmediate(
    "select id from users",
    false,
    source,
    "statement",
    7,
  );

  assert.equal(result?.requestId, "query-1");
  assert.equal(activeRequestId, null);
  assert.equal(requests[0]?.connectionId, "conn-1");
  assert.equal(requests[0]?.schema, "app");
  assert.equal(requests[0]?.cursorOffset, 7);
  assert.equal(requests[0]?.continueOnError, false);
  assert.equal(successSessions[0]?.queryHistory[0]?.status, "success");
});

test("query execution controller previews dangerous SQL before executing safe statements", async () => {
  let activeRequestId: string | null = null;
  const events: string[] = [];
  const previewCalls: Array<{ sql: string; cursorOffset?: number }> = [];
  const requests: QueryExecutionRequest[] = [];

  const controller = createWorkbenchQueryExecutionController({
    connectionId: "conn-1",
    readonlyConnection: false,
    runtimeSchema: "app",
    schemaTables: [],
    stopOnError: false,
    isExecuting: false,
    isExporting: false,
    createRequestId: () => "query-2",
    getActiveQueryRequestId: () => activeRequestId,
    queryExecutionActions: {
      startRequest: (requestId) => {
        activeRequestId = requestId;
        events.push(`start:${requestId}`);
      },
      applySuccess: () => events.push("success"),
      applyFailure: () => assert.fail("failure path should not run"),
      finishRequest: (requestId) => {
        activeRequestId = null;
        events.push(`finish:${requestId}`);
      },
    },
    querySafetyActions: querySafetyActions(events),
    executeQuery: async (request) => {
      requests.push(request);
      return response(request.requestId);
    },
    previewDangerousSql: async (sql, cursorOffset) => {
      previewCalls.push({ sql, cursorOffset });
      return safePreview();
    },
  });

  await controller.previewAndExecuteSql(
    "select id from users",
    null,
    "statement",
    11,
  );

  assert.deepEqual(previewCalls, [
    { sql: "select id from users", cursorOffset: 11 },
  ]);
  assert.equal(requests[0]?.cursorOffset, 11);
  assert.deepEqual(events, [
    "pending-sql:select id from users",
    "cursor:11",
    "source",
    "mode:statement",
    "query-error-clear",
    "start:query-2",
    "success",
    "finish:query-2",
    "pending-sql:null",
    "cursor:none",
    "source",
    "mode:statement",
  ]);
});
