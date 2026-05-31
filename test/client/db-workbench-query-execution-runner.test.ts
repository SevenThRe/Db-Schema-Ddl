import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQueryExecutionFailureNotice,
  createQueryExecutionStateActions,
  runApplyQueryExecutionFailureState,
  runApplyQueryExecutionSuccessState,
  runFinishQueryExecutionRequestState,
  runStartQueryExecutionRequestState,
  runWorkbenchQueryExecution,
} from "../../client/src/components/extensions/db-workbench/query-execution-runner";
import type {
  DbGridEditSource,
  QueryExecutionRequest,
  QueryExecutionResponse,
} from "../../shared/schema";

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
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function installWindowWithStorage(): void {
  Reflect.set(globalThis, "window", { localStorage: createMemoryStorage() });
}

function response(requestId = "request-1"): QueryExecutionResponse {
  return {
    requestId,
    batches: [
      {
        sql: "select id from users",
        columns: [
          { name: "id", dataType: "integer", sourceTable: "users", sourceColumn: "id" },
        ],
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

test.beforeEach(() => {
  installWindowWithStorage();
});

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("query execution runner applies successful responses and finalizes active requests", async () => {
  let activeRequestId: string | null = null;
  const executedRequests: QueryExecutionRequest[] = [];
  const successCalls: unknown[] = [];
  const finished: string[] = [];
  const source: DbGridEditSource = {
    kind: "starter-select",
    tableName: "users",
    schema: "app",
  };

  const result = await runWorkbenchQueryExecution({
    connectionId: "conn-1",
    sql: "select id from users",
    confirmed: false,
    source,
    mode: "statement",
    runtimeSchema: "app",
    stopOnError: true,
    createRequestId: () => "request-1",
    getActiveRequestId: () => activeRequestId,
    startRequest: (requestId) => {
      activeRequestId = requestId;
    },
    executeQuery: async (request) => {
      executedRequests.push(request);
      return response(request.requestId);
    },
    decorateResults: (queryResponse) => ({
      ...queryResponse,
      batches: queryResponse.batches.map((batch) => ({
        ...batch,
        schema: "decorated",
      })),
    }),
    applySuccess: (input) => {
      successCalls.push(input);
      assert.equal(input.decoratedResponse.batches[0]?.schema, "decorated");
      assert.equal(input.session.queryHistory[0]?.status, "success");
    },
    applyFailure: () => assert.fail("failure path should not run"),
    finishRequest: (requestId) => {
      finished.push(requestId);
      activeRequestId = null;
    },
  });

  assert.equal(result?.requestId, "request-1");
  assert.equal(executedRequests[0]?.schema, "app");
  assert.equal(executedRequests[0]?.continueOnError, false);
  assert.equal(executedRequests[0]?.confirmed, undefined);
  assert.equal(successCalls.length, 1);
  assert.deepEqual(finished, ["request-1"]);
});

test("query execution runner centralizes request lifecycle UI state", () => {
  const events: string[] = [];
  let activeRequestId: string | null = null;

  runStartQueryExecutionRequestState({
    requestId: "request-1",
    setActiveRequestId: (requestId) => {
      activeRequestId = requestId;
      events.push(`active:${requestId}`);
    },
    setCurrentRequestId: (requestId) => events.push(`current:${requestId}`),
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    clearResults: () => events.push("results:null"),
    clearQueryError: () => events.push("error:null"),
  });
  runFinishQueryExecutionRequestState({
    requestId: "request-1",
    getActiveRequestId: () => activeRequestId,
    clearActiveRequestId: () => {
      activeRequestId = null;
      events.push("active:null");
    },
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    setCurrentRequestId: (requestId) => events.push(`current:${requestId ?? "null"}`),
  });

  assert.equal(activeRequestId, null);
  assert.deepEqual(events, [
    "active:request-1",
    "current:request-1",
    "executing:true",
    "results:null",
    "error:null",
    "active:null",
    "executing:false",
    "current:null",
  ]);
});

test("query execution runner applies success and failure UI state", () => {
  const events: string[] = [];
  const session = {
    recentQueries: ["select 1"],
    queryHistory: [],
    sqlMemory: {
      acceptedSuggestions: [],
      queryPatterns: [],
      retention: {
        captureExecutedQueries: true,
        captureAcceptedCompletions: true,
      },
    },
  };

  runApplyQueryExecutionSuccessState({
    decoratedResponse: response("request-1"),
    source: null,
    session,
    setResults: (queryResponse) => events.push(`results:${queryResponse.requestId}`),
    setLastGridEditSource: (nextSource) => events.push(`source:${nextSource?.kind ?? "null"}`),
    clearGridDrafts: () => events.push("drafts:{}"),
    resetActiveBatchIndex: () => events.push("batch:0"),
    selectResultsTab: () => events.push("tab:results"),
    applySession: (nextSession) => events.push(`session:${nextSession.recentQueries[0]}`),
  });
  runApplyQueryExecutionFailureState({
    message: "syntax error",
    notice: buildQueryExecutionFailureNotice("syntax error"),
    session,
    setQueryError: (message) => events.push(`error:${message}`),
    selectResultsTab: () => events.push("tab:results"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    applySession: (nextSession) => events.push(`session:${nextSession.recentQueries[0]}`),
  });

  assert.deepEqual(events, [
    "results:request-1",
    "source:null",
    "drafts:{}",
    "batch:0",
    "tab:results",
    "session:select 1",
    "error:syntax error",
    "tab:results",
    "notice:查询执行失败",
    "session:select 1",
  ]);
});

test("query execution runner creates reusable state action objects", () => {
  const events: string[] = [];
  let activeRequestId: string | null = null;
  const session = {
    recentQueries: ["select 1"],
    queryHistory: [],
    sqlMemory: {
      acceptedSuggestions: [],
      queryPatterns: [],
      retention: {
        captureExecutedQueries: true,
        captureAcceptedCompletions: true,
      },
    },
  };
  const actions = createQueryExecutionStateActions({
    setActiveRequestId: (requestId) => {
      activeRequestId = requestId;
      events.push(`active:${requestId}`);
    },
    getActiveRequestId: () => activeRequestId,
    clearActiveRequestId: () => {
      activeRequestId = null;
      events.push("active:null");
    },
    setCurrentRequestId: (requestId) => events.push(`current:${requestId ?? "null"}`),
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    clearResults: () => events.push("results:null"),
    clearQueryError: () => events.push("error:null"),
    setResults: (queryResponse) => events.push(`results:${queryResponse.requestId}`),
    setLastGridEditSource: (nextSource) => events.push(`source:${nextSource?.kind ?? "null"}`),
    clearGridDrafts: () => events.push("drafts:{}"),
    resetActiveBatchIndex: () => events.push("batch:0"),
    selectResultsTab: () => events.push("tab:results"),
    setQueryError: (message) => events.push(`error:${message}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    setRecentQueries: (recentQueries) => events.push(`session:${recentQueries[0]}`),
    setQueryHistory: () => events.push("history:set"),
    setSqlMemory: () => events.push("memory:set"),
  });

  actions.startRequest("request-1");
  actions.applySuccess({
    decoratedResponse: response("request-1"),
    source: null,
    session,
  });
  actions.applyFailure({
    message: "syntax error",
    notice: buildQueryExecutionFailureNotice("syntax error"),
    session,
  });
  actions.finishRequest("request-1");

  assert.equal(activeRequestId, null);
  assert.deepEqual(events, [
    "active:request-1",
    "current:request-1",
    "executing:true",
    "results:null",
    "error:null",
    "results:request-1",
    "source:null",
    "drafts:{}",
    "batch:0",
    "tab:results",
    "session:select 1",
    "history:set",
    "memory:set",
    "error:syntax error",
    "tab:results",
    "notice:查询执行失败",
    "session:select 1",
    "history:set",
    "memory:set",
    "active:null",
    "executing:false",
    "current:null",
  ]);
});

test("query execution runner ignores stale responses without applying or finalizing them", async () => {
  let activeRequestId: string | null = null;
  let successCalls = 0;
  let finished = 0;

  const result = await runWorkbenchQueryExecution({
    connectionId: "conn-1",
    sql: "select id from users",
    confirmed: true,
    source: null,
    mode: "statement",
    runtimeSchema: null,
    stopOnError: false,
    createRequestId: () => "request-1",
    getActiveRequestId: () => activeRequestId,
    startRequest: (requestId) => {
      activeRequestId = requestId;
    },
    executeQuery: async () => {
      activeRequestId = "request-2";
      return response("request-1");
    },
    decorateResults: (queryResponse) => queryResponse,
    applySuccess: () => {
      successCalls += 1;
    },
    applyFailure: () => assert.fail("failure path should not run"),
    finishRequest: () => {
      finished += 1;
    },
  });

  assert.equal(result, null);
  assert.equal(successCalls, 0);
  assert.equal(finished, 0);
});

test("query execution runner formats failures and skips cancelled query history", async () => {
  let activeRequestId: string | null = null;
  const failureCalls: Array<{ message: string; session: unknown }> = [];
  let finished = 0;

  await runWorkbenchQueryExecution({
    connectionId: "conn-1",
    sql: "select pg_sleep(8)",
    confirmed: false,
    source: null,
    mode: "statement",
    stopOnError: true,
    createRequestId: () => "request-1",
    getActiveRequestId: () => activeRequestId,
    startRequest: (requestId) => {
      activeRequestId = requestId;
    },
    executeQuery: async () => {
      throw new Error("Error invoking execute_query: Query cancelled by request");
    },
    decorateResults: (queryResponse) => queryResponse,
    applySuccess: () => assert.fail("success path should not run"),
    applyFailure: (input) => {
      failureCalls.push({ message: input.message, session: input.session });
      assert.deepEqual(input.notice, buildQueryExecutionFailureNotice(input.message));
    },
    finishRequest: () => {
      finished += 1;
      activeRequestId = null;
    },
  });

  assert.equal(failureCalls[0]?.message, "Query cancelled by request");
  assert.equal(failureCalls[0]?.session, null);
  assert.equal(finished, 1);
});
