import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import type { DbColumnSchema, DbQueryBatchResult, DbSchemaSnapshot } from "../../shared/schema.ts";
import {
  buildAutocompleteContext,
  buildCompletionItems,
} from "../../client/src/components/extensions/db-workbench/sql-autocomplete.ts";
import {
  clearSqlMemory,
  loadSessionForConnection,
  recordAcceptedSqlSuggestion,
  recordQueryRun,
  updateSqlMemoryRetentionSettings,
} from "../../client/src/components/extensions/db-workbench/workbench-session.ts";
import {
  buildQueryMemoryPatternFromResponse,
  buildSqlMemorySuggestionKey,
  createEmptySqlWorkbenchMemory,
  extractSqlMemoryValueProfilesFromBatches,
} from "../../client/src/components/extensions/db-workbench/sql-memory.ts";

interface MemoryStorage {
  clear: () => void;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
  length: number;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

const ROOT = process.cwd();

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function installWindowWithStorage(): void {
  const localStorage = createMemoryStorage();
  Reflect.set(globalThis, "window", { localStorage });
}

function column(name: string): DbColumnSchema {
  return {
    name,
    dataType: "varchar",
    nullable: false,
    primaryKey: name === "id",
  };
}

function createSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "conn-phase51",
    connectionName: "phase51",
    database: "app_db",
    schema: "public",
    tables: [
      {
        name: "public.users",
        columns: [column("id"), column("email"), column("created_at")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "public.orders",
        columns: [column("id"), column("user_id"), column("total_amount")],
        indexes: [],
        foreignKeys: [],
      },
    ],
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test.beforeEach(() => {
  installWindowWithStorage();
});

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("accepted completion memory persists per connection and increments reuse counts", () => {
  recordAcceptedSqlSuggestion("conn-memory", {
    label: "email",
    kind: "column",
    schema: "public",
    relation: "users",
    column: "email",
  });

  recordAcceptedSqlSuggestion("conn-memory", {
    label: "email",
    kind: "column",
    schema: "public",
    relation: "users",
    column: "email",
  });

  const session = loadSessionForConnection("conn-memory");
  const expectedKey = buildSqlMemorySuggestionKey({
    label: "email",
    kind: "column",
    schema: "public",
    relation: "users",
    column: "email",
  });

  assert.equal(session.sqlMemory.acceptedSuggestions.length, 1);
  assert.equal(session.sqlMemory.acceptedSuggestions[0]?.key, expectedKey);
  assert.equal(session.sqlMemory.acceptedSuggestions[0]?.count, 2);
});

test("query memory captures safe patterns and value profiles without raw values", () => {
  const batch: DbQueryBatchResult = {
    sql: "SELECT email, created_at FROM users;",
    columns: [
      {
        name: "email",
        dataType: "varchar",
        sourceSchema: "public",
        sourceTable: "users",
        sourceColumn: "email",
      },
      {
        name: "created_at",
        dataType: "timestamp",
        sourceSchema: "public",
        sourceTable: "users",
        sourceColumn: "created_at",
      },
    ],
    rows: [
      { values: ["owner@example.com", "2026-04-18T08:00:00Z"] },
      { values: ["billing@example.com", "2026-04-18T09:30:00Z"] },
    ],
    totalRows: 2,
    returnedRows: 2,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 12,
    schema: "public",
  };

  const valueProfiles = extractSqlMemoryValueProfilesFromBatches([batch], "public", "users");
  recordQueryRun("conn-memory", {
    sql: "SELECT email, created_at FROM users WHERE email LIKE '%@example.com';",
    mode: "statement",
    status: "success",
    statementCount: 1,
    returnedRows: 2,
    elapsedMs: 12,
    memoryPattern: {
      patternSql: "SELECT email, created_at FROM users WHERE email LIKE ?;",
      statementKind: "select",
      schema: "public",
      relationKeys: ["public.users"],
      columnKeys: ["public.users.email", "public.users.created_at"],
    },
    valueProfiles,
  });

  const session = loadSessionForConnection("conn-memory");
  assert.equal(session.sqlMemory.queryPatterns.length, 1);
  assert.equal(session.sqlMemory.queryPatterns[0]?.statementKind, "select");
  assert.deepEqual(session.sqlMemory.queryPatterns[0]?.relationKeys, ["public.users"]);
  assert.equal(session.sqlMemory.valueProfiles.length, 2);
  assert.equal(
    session.sqlMemory.valueProfiles.some(
      (entry) => entry.column === "email" && entry.exampleHints.includes("email-like"),
    ),
    true,
  );
  assert.equal(
    session.sqlMemory.valueProfiles.some((entry) => entry.exampleHints.includes("owner@example.com")),
    false,
  );
});

test("query memory builds patterns from execution responses", () => {
  const batch: DbQueryBatchResult = {
    sql: "select id, email from users",
    columns: [
      {
        name: "id",
        dataType: "bigint",
        sourceSchema: "app",
        sourceTable: "users",
        sourceColumn: "id",
      },
      {
        name: "email",
        dataType: "varchar",
        sourceSchema: "app",
        sourceTable: "users",
        sourceColumn: "email",
      },
    ],
    rows: [],
    totalRows: 0,
    returnedRows: 0,
    hasMore: false,
    pagingMode: "none",
    schema: "app",
    elapsedMs: 1,
  };

  const pattern = buildQueryMemoryPatternFromResponse(
    "select id, email from users",
    "statement",
    { requestId: "query-1", batches: [batch] },
    "app",
    { kind: "starter-select", schema: "app", tableName: "users" },
  );

  assert.equal(pattern.statementKind, "select");
  assert.equal(pattern.schema, "app");
  assert.deepEqual(pattern.relationKeys, ["app.users"]);
  assert.deepEqual(pattern.columnKeys, ["app.users.id", "app.users.email"]);
});

test("retention toggles and schema clears scope SQL memory explicitly", () => {
  updateSqlMemoryRetentionSettings("conn-memory", {
    captureValueProfiles: false,
  });

  recordQueryRun("conn-memory", {
    sql: "SELECT * FROM users;",
    mode: "statement",
    status: "success",
    statementCount: 1,
    memoryPattern: {
      patternSql: "SELECT * FROM users;",
      statementKind: "select",
      schema: "public",
      relationKeys: ["public.users"],
      columnKeys: ["public.users.email"],
    },
    valueProfiles: [
      {
        schema: "public",
        relation: "users",
        column: "email",
        sampleCount: 4,
        observedKinds: ["email-like"],
      },
    ],
  });

  recordQueryRun("conn-memory", {
    sql: "SELECT * FROM audit_log;",
    mode: "statement",
    status: "success",
    statementCount: 1,
    memoryPattern: {
      patternSql: "SELECT * FROM audit_log;",
      statementKind: "select",
      schema: "audit",
      relationKeys: ["audit.audit_log"],
      columnKeys: ["audit.audit_log.actor"],
    },
  });

  let session = loadSessionForConnection("conn-memory");
  assert.equal(session.sqlMemory.retention.captureValueProfiles, false);
  assert.equal(session.sqlMemory.valueProfiles.length, 0);
  assert.equal(session.sqlMemory.queryPatterns.length, 2);

  clearSqlMemory("conn-memory", { schema: "public" });
  session = loadSessionForConnection("conn-memory");
  assert.equal(
    session.sqlMemory.queryPatterns.some((entry) => entry.schema === "public"),
    false,
  );
  assert.equal(
    session.sqlMemory.queryPatterns.some((entry) => entry.schema === "audit"),
    true,
  );
});

test("adaptive ranking prefers grounded accepted columns over generic column order", () => {
  const memory = createEmptySqlWorkbenchMemory();
  memory.acceptedSuggestions = [
    {
      key: buildSqlMemorySuggestionKey({
        label: "email",
        kind: "column",
        schema: "public",
        relation: "users",
        column: "email",
      }),
      label: "email",
      kind: "column",
      schema: "public",
      relation: "users",
      column: "email",
      count: 3,
      lastAcceptedAt: "2026-04-18T12:00:00.000Z",
    },
  ];
  memory.queryPatterns = [
    {
      key: "public::select::select * from users where email = ?",
      summary: "SELECT * FROM users WHERE email = ?",
      patternSql: "SELECT * FROM users WHERE email = ?",
      statementKind: "select",
      schema: "public",
      relationKeys: ["public.users"],
      columnKeys: ["public.users.email"],
      count: 3,
      lastExecutedAt: "2026-04-18T12:00:00.000Z",
    },
  ];
  memory.valueProfiles = [
    {
      key: "public.users.email",
      schema: "public",
      relation: "users",
      column: "email",
      sampleCount: 16,
      nullCount: 0,
      observedKinds: ["email-like"],
      exampleHints: ["email-like"],
      lastObservedAt: "2026-04-18T12:00:00.000Z",
    },
  ];

  const context = buildAutocompleteContext(createSnapshot(), "public", "users", "postgres", memory);
  const sql = "SELECT * FROM users u WHERE ";
  const suggestions = buildCompletionItems(context, null, sql, sql.length).filter(
    (item) => item.kind === "column",
  );

  assert.equal(suggestions[0]?.label, "email");
});

test("workbench and editor wire SQL memory controls and completion acceptance hooks", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const sqlControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-sql-controllers.ts",
  );
  const editor = await read(
    "client/src/components/extensions/db-workbench/SqlEditorPane.tsx",
  );
  const editorPaneRuntime = await read(
    "client/src/components/extensions/db-workbench/sql-editor-pane-runtime.ts",
  );
  const editorRuntime = await read(
    "client/src/components/extensions/db-workbench/sql-editor-monaco-runtime.ts",
  );
  const operatorChrome = await read(
    "client/src/components/extensions/db-workbench/WorkbenchOperatorChrome.tsx",
  );
  const workspaceBody = await read(
    "client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
  );
  const workspaceBodyPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-workspace-body-props.ts",
  );
  const dialogStack = await read(
    "client/src/components/extensions/db-workbench/WorkbenchDialogStack.tsx",
  );
  const dialogInputBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-dialog-stack-input.ts",
  );
  const renderPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  );
  const workspaceBodyLayoutProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-workspace-body-props.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(operatorChrome, /SQL memory/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutSqlControllers\(\{/);
  assert.match(sqlControllers, /recordAcceptedSqlSuggestion/);
  assert.match(workbench, /<WorkbenchWorkspaceBody \{\.\.\.workspaceBodyProps\} \/>/);
  assert.match(workspaceBody, /<WorkbenchSqlToolStrip \{\.\.\.sqlToolStrip\} \/>/);
  assert.match(workbench, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilder, /buildWorkbenchLayoutWorkspaceBodyProps\(\{/);
  assert.match(workspaceBodyLayoutProps, /sqlMemoryPatternCount: input\.sqlMemory\.queryPatterns\.length,/);
  assert.match(workspaceBodyLayoutProps, /onCompletionAccepted: input\.handleCompletionAccepted,/);
  assert.match(workspaceBodyPropsBuilder, /sqlToolStrip: \{/);
  assert.match(workspaceBodyPropsBuilder, /\.\.\.input\.sqlToolStrip,/);
  assert.match(workbench, /<WorkbenchDialogStack \{\.\.\.dialogStackProps\} \/>/);
  assert.match(dialogInputBuilder, /sqlMemory: \{/);
  assert.match(dialogInputBuilder, /connectionLabel,/);
  assert.match(dialogInputBuilder, /activeSchema: input\.activeSchema \?\? null,/);
  assert.match(dialogStack, /<SqlMemoryDialog \{\.\.\.sqlMemory\} \/>/);
  assert.match(editor, /useSqlEditorPaneRuntime/);
  assert.match(editorPaneRuntime, /registerSqlCompletionAcceptanceCommand/);
  assert.match(editorRuntime, /db-workbench\.record-completion-acceptance/);
  assert.match(editor, /onCompletionAccepted/);
});
