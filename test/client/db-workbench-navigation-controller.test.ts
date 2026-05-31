import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchNavigationController,
} from "../../client/src/components/extensions/db-workbench/workbench-navigation-controller";
import type {
  DbConnectionConfig,
  DbGridEditSource,
  DbTableSchema,
} from "../../shared/schema";

function connection(): DbConnectionConfig {
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

test("workbench navigation controller centralizes connection, schema, and starter-query commands", async () => {
  const events: string[] = [];
  const executions: Array<{ sql: string; source: DbGridEditSource }> = [];
  const savedConnections: DbConnectionConfig[] = [];

  const controller = createWorkbenchNavigationController({
    connection: connection(),
    activeSchema: "public",
    tables: [usersTable],
    runtimeSchema: "app",
    snapshotSchema: "public",
    actions: {
      selectTable: (tableName) => events.push(`select:${tableName}`),
      applyQueryWorkspaceReset: (reset) => events.push(`reset:${reset.resultTab}`),
    },
    onSwitchConnection: (connectionId) => events.push(`switch:${connectionId}`),
    saveConnection: async (nextConnection) => {
      savedConnections.push(nextConnection);
      events.push(`save:${nextConnection.defaultSchema}`);
    },
    invalidateConnections: async () => events.push("invalidate"),
    refetchSchema: async () => events.push("schema"),
    refetchSchemaOptions: async () => events.push("options"),
    applyActiveSchema: (schema) => events.push(`active:${schema}`),
    updateActiveTabSql: (sql) => events.push(`sql:${sql}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setLastGridEditSource: (source) => events.push(`source:${source.kind}`),
    focusSqlEditor: () => events.push("focus"),
    executeQuery: async (sql, source) => executions.push({ sql, source }),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  controller.handleSwitchConnection("conn-1");
  controller.handleSwitchConnection("conn-2");
  await controller.handleSchemaChange(" analytics ");
  controller.handleSelectTable("users");
  await controller.handleRunStarterQuery("users", "columns");
  await controller.handleOpenTable("users");

  assert.equal(savedConnections[0]?.defaultSchema, "analytics");
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.source.kind, "starter-select");
  assert.ok(events.includes("switch:conn-2"));
  assert.ok(events.includes("save:analytics"));
  assert.ok(events.includes("reset:results"));
  assert.ok(events.includes("focus"));
  assert.ok(events.includes("source:starter-columns"));
  assert.ok(events.includes("source:starter-select"));
});
