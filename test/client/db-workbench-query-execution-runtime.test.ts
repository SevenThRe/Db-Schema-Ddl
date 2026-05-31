import test from "node:test";
import assert from "node:assert/strict";
import type { QueryExecutionResponse } from "../../shared/schema";
import {
  buildQueryExecutionRequest,
  buildFailedQueryRunRecord,
  buildSuccessfulQueryRunRecord,
  recordFailedQueryExecution,
  recordSuccessfulQueryExecution,
  resolveQueryMemorySchema,
} from "../../client/src/components/extensions/db-workbench/query-execution-runtime";
import { loadSessionForConnection } from "../../client/src/components/extensions/db-workbench/workbench-session";

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

function response(): QueryExecutionResponse {
  return {
    requestId: "request-1",
    batches: [
      {
        sql: "select id, name from users where status = 'active'",
        columns: [
          { name: "id", dataType: "integer", sourceTable: "users", sourceColumn: "id" },
          { name: "name", dataType: "varchar", sourceTable: "users", sourceColumn: "name" },
        ],
        rows: [{ values: [1, "Aki"] }],
        totalRows: 1,
        returnedRows: 1,
        hasMore: false,
        pagingMode: "none",
        elapsedMs: 11,
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

test("query execution runtime resolves memory schema from runtime, source, then public", () => {
  assert.equal(resolveQueryMemorySchema(" app ", { kind: "custom-sql", schema: "source" }), "app");
  assert.equal(resolveQueryMemorySchema("", { kind: "custom-sql", schema: "source" }), "source");
  assert.equal(resolveQueryMemorySchema(null, null), "public");
});

test("query execution runtime builds backend request payload with safety flags", () => {
  assert.deepEqual(
    buildQueryExecutionRequest({
      connectionId: "conn-1",
      sql: "delete from users",
      requestId: "request-1",
      cursorOffset: 4,
      runtimeSchema: "app",
      stopOnError: true,
      confirmed: true,
    }),
    {
      connectionId: "conn-1",
      sql: "delete from users",
      requestId: "request-1",
      cursorOffset: 4,
      schema: "app",
      continueOnError: false,
      confirmed: true,
    },
  );
  assert.equal(
    buildQueryExecutionRequest({
      connectionId: "conn-1",
      sql: "select 1",
      requestId: "request-2",
      runtimeSchema: null,
      stopOnError: false,
      confirmed: false,
    }).confirmed,
    undefined,
  );
});

test("query execution runtime builds successful run records with memory context", () => {
  const record = buildSuccessfulQueryRunRecord({
    sql: "select id, name from users where status = 'active'",
    mode: "statement",
    response: response(),
    runtimeSchema: "public",
    source: { kind: "starter-select", tableName: "users", schema: "public" },
  });

  assert.equal(record.status, "success");
  assert.equal(record.statementCount, 1);
  assert.equal(record.returnedRows, 1);
  assert.equal(record.memoryPattern?.schema, "public");
  assert.deepEqual(record.memoryPattern?.relationKeys, ["public.users"]);
  assert.equal(record.valueProfiles?.[0]?.schema, "public");
});

test("query execution runtime builds failed run records with script statement count", () => {
  const record = buildFailedQueryRunRecord({
    sql: "select 1; select broken;",
    mode: "script",
    errorMessage: "unknown column broken",
  });

  assert.equal(record.status, "failed");
  assert.equal(record.statementCount, 2);
  assert.equal(record.errorMessage, "unknown column broken");
});

test("query execution runtime records successful and failed sessions", () => {
  recordSuccessfulQueryExecution({
    connectionId: "conn-query-runtime",
    sql: "select id, name from users where status = 'active'",
    mode: "statement",
    response: response(),
    runtimeSchema: "public",
    source: { kind: "starter-select", tableName: "users", schema: "public" },
  });
  recordFailedQueryExecution({
    connectionId: "conn-query-runtime",
    sql: "select broken;",
    mode: "statement",
    errorMessage: "unknown column broken",
  });

  const session = loadSessionForConnection("conn-query-runtime");

  assert.equal(session.queryHistory.length, 2);
  assert.equal(session.queryHistory[0]?.status, "failed");
  assert.equal(session.queryHistory[1]?.status, "success");
  assert.equal(session.recentQueries[0], "select broken;");
  assert.ok(session.sqlMemory.queryPatterns.length > 0);
});
