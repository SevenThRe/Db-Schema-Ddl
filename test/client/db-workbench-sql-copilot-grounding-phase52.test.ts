import test from "node:test";
import assert from "node:assert/strict";

import type {
  DbColumnSchema,
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "../../shared/schema.ts";
import { createDefaultDdlSettings } from "../../shared/config.ts";
import { buildSqlCopilotPromptPackage } from "../../client/src/components/extensions/db-workbench/sql-copilot-grounding.ts";
import {
  createEmptySqlWorkbenchMemory,
  type SqlWorkbenchMemoryState,
} from "../../client/src/components/extensions/db-workbench/sql-memory.ts";

function column(name: string, primaryKey = false): DbColumnSchema {
  return {
    name,
    dataType: primaryKey ? "bigint" : "varchar",
    nullable: !primaryKey,
    primaryKey,
  };
}

function createConnection(): DbConnectionConfig {
  return {
    id: "conn-phase52",
    name: "Phase 52 Demo",
    driver: "postgres",
    host: "127.0.0.1",
    port: 5432,
    database: "app_db",
    username: "postgres",
    password: "",
    defaultSchema: "public",
  };
}

function createSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "conn-phase52",
    connectionName: "Phase 52 Demo",
    database: "app_db",
    schema: "public",
    tables: [
      {
        name: "public.users",
        columns: [column("id", true), column("email"), column("created_at")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "public.orders",
        columns: [column("id", true), column("user_id"), column("status")],
        indexes: [],
        foreignKeys: [
          {
            name: "fk_orders_users",
            columns: ["user_id"],
            referencedTable: "public.users",
            referencedColumns: ["id"],
          },
        ],
      },
    ],
    views: [
      {
        name: "public.active_users",
        columns: [column("id"), column("email")],
      },
    ],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

function createMemory(): SqlWorkbenchMemoryState {
  const memory = createEmptySqlWorkbenchMemory();
  memory.queryPatterns = [
    {
      key: "pattern-orders",
      summary: "Recent order join",
      patternSql: "SELECT o.id, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = ?",
      statementKind: "select",
      schema: "public",
      relationKeys: ["public.orders", "public.users"],
      columnKeys: ["public.orders.status", "public.users.email"],
      count: 4,
      lastExecutedAt: "2026-04-18T01:00:00.000Z",
    },
  ];
  memory.valueProfiles = [
    {
      key: "orders-status",
      schema: "public",
      relation: "orders",
      column: "status",
      sampleCount: 32,
      nullCount: 0,
      observedKinds: ["text"],
      exampleHints: ["text", "owner@example.com"],
      lastObservedAt: "2026-04-18T01:00:00.000Z",
    },
  ];
  return memory;
}

test("buildSqlCopilotPromptPackage grounds SQL probe in schema, driver rules, and safe memory summaries", () => {
  const settings = createDefaultDdlSettings();
  settings.sqlCopilotEnabled = true;
  settings.sqlCopilotOllamaModel = "qwen2.5-coder:3b";

  const promptPackage = buildSqlCopilotPromptPackage({
    settings,
    connection: createConnection(),
    schemaSnapshot: createSnapshot(),
    sqlMemory: createMemory(),
    currentSql:
      "SELECT o.id, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = 'paid';",
    activeSchema: "public",
    selectedTableName: "public.orders",
    operatorPrompt: "Review the draft and call out missing indexes or unsafe assumptions.",
  });

  assert.equal(promptPackage.provider, "ollama");
  assert.equal(promptPackage.groundingSummary.driver, "postgres");
  assert.match(promptPackage.promptPreview, /Schema grounding:/);
  assert.match(promptPackage.promptPreview, /TABLE public\.orders/);
  assert.match(promptPackage.promptPreview, /Driver rules:/);
  assert.match(promptPackage.promptPreview, /Treat PostgreSQL syntax/);
  assert.match(promptPackage.promptPreview, /Safe query memory:/);
  assert.match(promptPackage.promptPreview, /Recent order join/);
  assert.match(promptPackage.promptPreview, /Value-shape grounding:/);
  assert.match(promptPackage.promptPreview, /public\.orders\.status/);
  assert.match(promptPackage.promptPreview, /Review the draft and call out missing indexes/);
  assert.equal(promptPackage.promptPreview.includes("owner@example.com"), false);
  assert.ok(promptPackage.groundingSummary.promptCharCount > 0);
});

test("buildSqlCopilotPromptPackage respects grounding limits and provider selection", () => {
  const settings = createDefaultDdlSettings();
  settings.sqlCopilotProvider = "llama_cpp_cli";
  settings.sqlCopilotGroundingMaxTables = 1;
  settings.sqlCopilotGroundingMaxPatterns = 0;
  settings.sqlCopilotGroundingMaxValueProfiles = 0;

  const promptPackage = buildSqlCopilotPromptPackage({
    settings,
    connection: createConnection(),
    schemaSnapshot: createSnapshot(),
    sqlMemory: createMemory(),
    currentSql: "SELECT * FROM orders;",
    activeSchema: "public",
    selectedTableName: "public.orders",
  });

  assert.equal(promptPackage.provider, "llama_cpp_cli");
  assert.equal(promptPackage.groundingSummary.relationCount, 1);
  assert.equal(promptPackage.groundingSummary.memoryPatternCount, 0);
  assert.equal(promptPackage.groundingSummary.valueProfileCount, 0);
  assert.match(promptPackage.promptPreview, /TABLE public\.orders/);
  assert.equal(promptPackage.promptPreview.includes("TABLE public.users"), false);
  assert.equal(promptPackage.promptPreview.includes("Safe query memory:"), false);
  assert.equal(promptPackage.promptPreview.includes("Value-shape grounding:"), false);
});
