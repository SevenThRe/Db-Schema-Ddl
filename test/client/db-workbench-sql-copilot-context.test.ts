import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDdlSettings } from "../../shared/config";
import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "../../shared/schema";
import { buildWorkbenchSqlCopilotContext } from "../../client/src/components/extensions/db-workbench/workbench-sql-copilot-context";
import { createEmptySqlWorkbenchMemory } from "../../client/src/components/extensions/db-workbench/sql-memory";
import { pickSqlCopilotSettings } from "../../client/src/components/extensions/db-workbench/sql-copilot-settings";
import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";

const connection: DbConnectionConfig = {
  id: "conn-1",
  name: "Local app",
  driver: "postgres",
  host: "127.0.0.1",
  port: 5432,
  database: "app",
  username: "postgres",
  password: "",
  environment: "dev",
};

const schemaSnapshot: DbSchemaSnapshot = {
  connectionId: "conn-1",
  connectionName: "Local app",
  database: "app",
  schema: "public",
  tables: [
    {
      name: "users",
      columns: [
        {
          name: "id",
          dataType: "integer",
          nullable: false,
          primaryKey: true,
        },
        {
          name: "email",
          dataType: "text",
          nullable: false,
          primaryKey: false,
        },
      ],
    },
  ],
  views: [],
  routines: [],
  triggers: [],
  sequences: [],
};

const tabs: QueryTab[] = [
  {
    id: "tab-1",
    title: "Tab 1",
    sql: "select * from ignored",
  },
  {
    id: "tab-2",
    title: "Tab 2",
    sql: "select email from users",
  },
];

test("sql copilot context centralizes active sql, prompt grounding, and dirty settings", () => {
  const defaultDdlSettings = createDefaultDdlSettings();
  const settingsDraft = {
    ...pickSqlCopilotSettings(defaultDdlSettings),
    sqlCopilotEnabled: true,
    sqlCopilotGroundingMaxTables: 4,
  };

  const context = buildWorkbenchSqlCopilotContext({
    ddlSettings: defaultDdlSettings,
    defaultDdlSettings,
    settingsDraft,
    runtimeError: new Error("Error invoking get_sql_copilot_runtime_state: offline"),
    tabs,
    activeTabId: "tab-2",
    connection,
    schemaSnapshot,
    sqlMemory: createEmptySqlWorkbenchMemory(),
    runtimeSchema: "public",
    selectedTableName: "users",
    operatorPrompt: "make it safer",
  });

  assert.equal(context.activeSqlText, "select email from users");
  assert.equal(context.effectiveSettings.sqlCopilotEnabled, true);
  assert.equal(context.settingsDirty, true);
  assert.equal(context.runtimeErrorMessage, "offline");
  assert.equal(context.promptPackage.groundingSummary.driver, "postgres");
  assert.match(
    context.promptPackage.sections.map((section) => section.body).join("\n"),
    /users/,
  );
  assert.equal(context.generationMode, "intent_refinement");
  assert.equal(context.generationPromptPackage.groundingSummary.driver, "postgres");
  assert.ok(context.generationSemanticContext.relations.length > 0);
});

test("sql copilot context falls back to first tab and clean persisted settings", () => {
  const defaultDdlSettings = createDefaultDdlSettings();
  const settingsDraft = pickSqlCopilotSettings(defaultDdlSettings);

  const context = buildWorkbenchSqlCopilotContext({
    ddlSettings: null,
    defaultDdlSettings,
    settingsDraft,
    runtimeError: null,
    tabs,
    activeTabId: "missing",
    connection,
    schemaSnapshot: null,
    sqlMemory: createEmptySqlWorkbenchMemory(),
    runtimeSchema: null,
    selectedTableName: null,
    operatorPrompt: "",
  });

  assert.equal(context.activeSqlText, "select * from ignored");
  assert.equal(context.settingsDirty, false);
  assert.equal(context.runtimeErrorMessage, null);
  assert.equal(context.generationMode, "partial_sql_completion");
  assert.deepEqual(context.generationSemanticContext.relations, []);
});
