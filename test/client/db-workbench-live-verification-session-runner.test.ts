import test from "node:test";
import assert from "node:assert/strict";
import type {
  BinaryCommandResult,
  DbConnectionConfig,
  DbGridDeleteRowDraft,
  DbGridEditSource,
  DbGridPrepareCommitResponse,
  DbObjectInspectionResponse,
  DbQueryBatchResult,
  QueryExecutionRequest,
  QueryExecutionResponse,
} from "../../shared/schema";
import {
  createWorkbenchLiveVerificationRunner,
  sleepWithBrowserTimer,
  startWorkbenchLiveVerificationSession,
} from "../../client/src/components/extensions/db-workbench/live-verification-session-runner";

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

function createRunner() {
  return {
    inspectObject: async (): Promise<DbObjectInspectionResponse | null> => null,
    updateActiveTabSql: () => undefined,
    setResultTab: () => undefined,
    setLastGridEditSource: (_source: DbGridEditSource | null) => undefined,
    executeImmediate: async (): Promise<QueryExecutionResponse | null> => null,
    loadMore: async (): Promise<DbQueryBatchResult | null> => null,
    exportCurrentPage: async (): Promise<BinaryCommandResult | null> => null,
    stageDeleteRow: (_row: DbGridDeleteRowDraft) => undefined,
    prepareGridCommit: async (): Promise<DbGridPrepareCommitResponse | null> => null,
    revertGridDelete: () => undefined,
    clearPreparedGridPlan: () => undefined,
    randomRequestId: () => "cancel-1",
    startCancelRequest: () => undefined,
    executeCancelQuery: async (
      _request: QueryExecutionRequest,
    ): Promise<QueryExecutionResponse> => {
      throw new Error("cancelled");
    },
    cancelQuery: async () => undefined,
    finishCancelRequest: () => undefined,
    sleep: async () => undefined,
  };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("live verification session runner gates disabled release verification", async () => {
  const runKeyStore = { current: null as string | null };
  const cleanup = startWorkbenchLiveVerificationSession({
    releaseVerification: {
      enabled: false,
      autoOpenDbWorkbench: false,
      live: { enabled: true },
    },
    connection: createConnection(),
    isSchemaLoading: false,
    schemaSnapshot: null,
    runKeyStore,
    emitFlowCheckpoint: async () => assert.fail("flow should not emit"),
    emitCompletedCheckpoint: async () => assert.fail("completion should not emit"),
    runner: createRunner(),
  });

  assert.equal(cleanup, undefined);
  assert.equal(runKeyStore.current, null);
  await tick();
});

test("live verification session runner emits checkpoint metadata and stores run key", async () => {
  const flows: unknown[] = [];
  const completions: unknown[] = [];
  const runKeyStore = { current: null as string | null };

  const cleanup = startWorkbenchLiveVerificationSession({
    releaseVerification: {
      enabled: true,
      autoOpenDbWorkbench: false,
      live: { enabled: true },
    },
    connection: createConnection({ readonly: true }),
    isSchemaLoading: false,
    schemaSnapshot: null,
    schemaErrorMessage: "login failed",
    runKeyStore,
    emitFlowCheckpoint: async (flowId, status, metadata) => {
      flows.push({ flowId, status, metadata });
    },
    emitCompletedCheckpoint: async (metadata) => {
      completions.push(metadata);
    },
    runner: createRunner(),
  });

  await tick();
  assert.equal(typeof cleanup, "function");
  assert.equal(runKeyStore.current, "conn-1:mysql");
  assert.deepEqual(flows, [
    {
      flowId: "connect",
      status: "failed",
      metadata: {
        driver: "mysql",
        connectionId: "conn-1",
        connectionName: "Reporting DB",
        note: "login failed",
      },
    },
  ]);
  assert.deepEqual(completions, [
    {
      driver: "mysql",
      connectionId: "conn-1",
      connectionName: "Reporting DB",
      status: "failed",
      note:
        "Live verification stopped before query flows because the connection could not be established.",
      database: "reporting",
      readonly: true,
    },
  ]);
});

test("live verification session runner skips duplicate run keys", async () => {
  const runKeyStore = { current: "conn-1:mysql" };
  const cleanup = startWorkbenchLiveVerificationSession({
    releaseVerification: {
      enabled: true,
      autoOpenDbWorkbench: false,
      live: { enabled: true },
    },
    connection: createConnection(),
    isSchemaLoading: false,
    schemaSnapshot: null,
    runKeyStore,
    emitFlowCheckpoint: async () => assert.fail("duplicate flow should not emit"),
    emitCompletedCheckpoint: async () =>
      assert.fail("duplicate completion should not emit"),
    runner: createRunner(),
  });

  assert.equal(cleanup, undefined);
  await tick();
});

test("live verification session runner creates reusable runner objects", async () => {
  const events: string[] = [];
  const runner = createWorkbenchLiveVerificationRunner({
    inspectObject: async (_kind, objectName) => {
      events.push(`inspect:${objectName}`);
      return null;
    },
    updateActiveTabSql: (sql) => events.push(`sql:${sql}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setLastGridEditSource: (source) => events.push(`source:${source?.mode ?? "none"}`),
    executeImmediate: async (sql) => {
      events.push(`execute:${sql}`);
      return null;
    },
    loadMore: async (batchIndex) => {
      events.push(`load:${batchIndex}`);
      return null;
    },
    exportCurrentPage: async () => {
      events.push("export");
      return null;
    },
    stageDeleteRow: (row) => events.push(`stage:${row.rowPkTuple}`),
    prepareGridCommit: async () => {
      events.push("prepare");
      return null;
    },
    revertGridDelete: (rowPkTuple) => events.push(`revert:${rowPkTuple}`),
    clearPreparedGridPlan: () => events.push("clear-plan"),
    randomRequestId: () => {
      events.push("random");
      return "request-1";
    },
    startCancelRequest: (requestId) => events.push(`cancel-start:${requestId}`),
    executeCancelQuery: async (request) => {
      events.push(`cancel-execute:${request.requestId}`);
      throw new Error("cancelled");
    },
    cancelQuery: async (requestId) => events.push(`cancel:${requestId}`),
    finishCancelRequest: (requestId) => events.push(`cancel-finish:${requestId}`),
    sleep: async (ms) => events.push(`sleep:${ms}`),
  });

  await runner.inspectObject("table", "users");
  runner.updateActiveTabSql("select * from users");
  runner.setResultTab("results");
  runner.setLastGridEditSource({ mode: "table", tableName: "users" });
  await runner.executeImmediate("select 1", false, null, "statement");
  await runner.loadMore(0);
  await runner.exportCurrentPage();
  runner.stageDeleteRow({ rowPrimaryKey: { id: 1 }, rowPkTuple: "id=1" });
  await runner.prepareGridCommit();
  runner.revertGridDelete("id=1");
  runner.clearPreparedGridPlan();
  const requestId = runner.randomRequestId();
  runner.startCancelRequest(requestId);
  await assert.rejects(
    runner.executeCancelQuery({
      connectionId: "conn-1",
      driver: "mysql",
      requestId,
      sql: "select sleep(10)",
      schema: null,
      cursorOffset: 0,
      stopOnError: true,
    }),
  );
  await runner.cancelQuery(requestId);
  runner.finishCancelRequest(requestId);
  await runner.sleep(0);

  assert.deepEqual(events, [
    "inspect:users",
    "sql:select * from users",
    "tab:results",
    "source:table",
    "execute:select 1",
    "load:0",
    "export",
    "stage:id=1",
    "prepare",
    "revert:id=1",
    "clear-plan",
    "random",
    "cancel-start:request-1",
    "cancel-execute:request-1",
    "cancel:request-1",
    "cancel-finish:request-1",
    "sleep:0",
  ]);
});

test("live verification browser sleep owns timer wiring", async () => {
  const events: string[] = [];
  Reflect.set(globalThis, "window", {
    setTimeout: (callback: () => void, delayMs: number) => {
      events.push(`timer:${delayMs}`);
      callback();
      return 11;
    },
  });

  try {
    await sleepWithBrowserTimer(125);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }

  assert.deepEqual(events, ["timer:125"]);
});
