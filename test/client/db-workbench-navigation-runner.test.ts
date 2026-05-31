import test from "node:test";
import assert from "node:assert/strict";

import {
  createNavigationStateActions,
  runSchemaChange,
  runStarterTableQuery,
} from "../../client/src/components/extensions/db-workbench/workbench-navigation-runner";
import { createQueryWorkspaceResetState } from "../../client/src/components/extensions/db-workbench/workbench-reset-runtime";
import type {
  DbConnectionConfig,
  DbGridEditSource,
  DbTableSchema,
} from "../../shared/schema";

function connection(
  overrides: Partial<DbConnectionConfig> = {},
): DbConnectionConfig {
  return {
    id: "conn-1",
    name: "Local Postgres",
    driver: "postgres",
    host: "localhost",
    port: 5432,
    database: "app",
    username: "app",
    password: "",
    defaultSchema: "public",
    ...overrides,
  };
}

const usersTable: DbTableSchema = {
  name: "users",
  columns: [
    { name: "id", dataType: "bigint", nullable: false, primaryKey: true },
    { name: "email", dataType: "text", nullable: false, primaryKey: false },
  ],
  indexes: [],
  foreignKeys: [],
};

test("navigation runner persists postgres schema changes and resets query workspace", async () => {
  const events: string[] = [];
  const savedConnections: DbConnectionConfig[] = [];

  const reset = await runSchemaChange({
    connection: connection(),
    activeSchema: "public",
    nextSchema: " analytics ",
    saveConnection: async (nextConnection) => {
      savedConnections.push(nextConnection);
      events.push(`save:${nextConnection.defaultSchema}`);
    },
    invalidateConnections: async () => events.push("invalidate"),
    refetchSchema: async () => events.push("schema"),
    refetchSchemaOptions: async () => events.push("options"),
    applyActiveSchema: (schema) => events.push(`active:${schema}`),
    applyQueryWorkspaceReset: (nextReset) => events.push(`reset:${nextReset.resultTab}`),
    showNotification: () => assert.fail("notice should not show"),
  });

  assert.equal(reset?.resultTab, "results");
  assert.equal(savedConnections[0]?.defaultSchema, "analytics");
  assert.deepEqual(events, [
    "active:analytics",
    "save:analytics",
    "invalidate",
    "schema",
    "options",
    "reset:results",
  ]);
});

test("navigation runner ignores unsupported or unchanged schema switches", async () => {
  const events: string[] = [];

  const mysqlResult = await runSchemaChange({
    connection: connection({ driver: "mysql", port: 3306 }),
    activeSchema: "app",
    nextSchema: "other",
    saveConnection: async () => assert.fail("mysql schema switch should not save"),
    invalidateConnections: async () => assert.fail("mysql schema switch should not invalidate"),
    refetchSchema: async () => assert.fail("mysql schema switch should not refetch"),
    refetchSchemaOptions: async () => assert.fail("mysql schema switch should not refetch"),
    applyActiveSchema: () => assert.fail("mysql schema switch should not apply"),
    applyQueryWorkspaceReset: () => assert.fail("mysql schema switch should not reset"),
    showNotification: () => assert.fail("mysql schema switch should not notify"),
  });
  const sameResult = await runSchemaChange({
    connection: connection(),
    activeSchema: "public",
    nextSchema: " public ",
    saveConnection: async () => assert.fail("same schema switch should not save"),
    invalidateConnections: async () => assert.fail("same schema switch should not invalidate"),
    refetchSchema: async () => assert.fail("same schema switch should not refetch"),
    refetchSchemaOptions: async () => assert.fail("same schema switch should not refetch"),
    applyActiveSchema: (schema) => events.push(schema),
    applyQueryWorkspaceReset: () => assert.fail("same schema switch should not reset"),
    showNotification: () => assert.fail("same schema switch should not notify"),
  });

  assert.equal(mysqlResult, null);
  assert.equal(sameResult, null);
  assert.deepEqual(events, []);
});

test("navigation runner rolls schema back and notifies when persistence fails", async () => {
  const events: string[] = [];

  const result = await runSchemaChange({
    connection: connection(),
    activeSchema: "public",
    nextSchema: "reporting",
    saveConnection: async () => {
      events.push("save");
      throw new Error("cannot save");
    },
    invalidateConnections: async () => assert.fail("invalidate should not run"),
    refetchSchema: async () => assert.fail("schema refetch should not run"),
    refetchSchemaOptions: async () => assert.fail("schema options refetch should not run"),
    applyActiveSchema: (schema) => events.push(`active:${schema}`),
    applyQueryWorkspaceReset: () => assert.fail("reset should not apply"),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.description}`),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "active:reporting",
    "save",
    "active:public",
    "notice:Schema switch failed:cannot save",
  ]);
});

test("navigation runner builds and executes starter select queries", async () => {
  const events: string[] = [];
  const executions: Array<{ sql: string; source: DbGridEditSource }> = [];

  const result = await runStarterTableQuery({
    connection: {
      driver: "postgres",
      defaultSchema: "public",
    },
    tableName: "users",
    mode: "select",
    tables: [usersTable],
    runtimeSchema: "app",
    snapshotSchema: "public",
    selectTable: (tableName) => events.push(`select:${tableName}`),
    updateActiveTabSql: (sql) => events.push(`sql:${sql}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setLastGridEditSource: (source) => events.push(`source:${source.kind}`),
    focusSqlEditor: () => assert.fail("select mode should not focus editor"),
    executeQuery: async (sql, source) => executions.push({ sql, source }),
  });

  assert.equal(result.executed, true);
  assert.equal(result.sql, 'SELECT *\nFROM "app"."users"\nLIMIT 100;');
  assert.equal(executions[0]?.source.kind, "starter-select");
  assert.deepEqual(events, [
    "select:users",
    'sql:SELECT *\nFROM "app"."users"\nLIMIT 100;',
    "tab:results",
    "source:starter-select",
  ]);
});

test("navigation runner keeps explicit column starter queries in editor only", async () => {
  const events: string[] = [];

  const result = await runStarterTableQuery({
    connection: {
      driver: "mysql",
      defaultSchema: undefined,
    },
    tableName: "users",
    mode: "columns",
    tables: [usersTable],
    selectTable: (tableName) => events.push(`select:${tableName}`),
    updateActiveTabSql: (sql) => events.push(`sql:${sql}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setLastGridEditSource: (source) => events.push(`source:${source.kind}`),
    focusSqlEditor: () => events.push("focus"),
    executeQuery: async () => assert.fail("columns mode should not execute"),
  });

  assert.equal(result.executed, false);
  assert.equal(
    result.sql,
    "SELECT\n  `id`,\n  `email`\nFROM `users`\nLIMIT 100;",
  );
  assert.deepEqual(events, [
    "select:users",
    "sql:SELECT\n  `id`,\n  `email`\nFROM `users`\nLIMIT 100;",
    "tab:results",
    "source:starter-columns",
    "focus",
  ]);
});

test("navigation runner creates reusable reset state action objects", () => {
  const events: string[] = [];
  const actions = createNavigationStateActions({
    setSelectedTableName: (tableName) => events.push(`select:${tableName}`),
    setResults: (results) => events.push(`results:${results ? "set" : "none"}`),
    setExplainPlan: (plan) => events.push(`explain:${plan ? "set" : "none"}`),
    setQueryError: (message) => events.push(`query-error:${message ?? "none"}`),
    setExplainError: (message) => events.push(`explain-error:${message ?? "none"}`),
    setActiveBatchIndex: (index) => events.push(`batch:${index}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setPendingEditCells: (cells) => events.push(`edits:${Object.keys(cells).length}`),
    setPendingDeleteRows: (rows) => events.push(`deletes:${Object.keys(rows).length}`),
    setPendingInsertedRows: (rows) => events.push(`inserts:${Object.keys(rows).length}`),
    setPreparedGridPlan: (plan) => events.push(`plan:${plan ? "set" : "none"}`),
    setLastGridEditSource: (source) => events.push(`source:${source?.kind ?? "none"}`),
  });

  actions.selectTable("users");
  actions.applyQueryWorkspaceReset(createQueryWorkspaceResetState());

  assert.deepEqual(events, [
    "select:users",
    "results:none",
    "explain:none",
    "query-error:none",
    "explain-error:none",
    "batch:0",
    "tab:results",
    "edits:0",
    "deletes:0",
    "inserts:0",
    "plan:none",
    "source:none",
  ]);
});
