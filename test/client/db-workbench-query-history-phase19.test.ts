import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildQueryRunEntryFromResponse,
  loadSessionForConnection,
  recordQueryRun,
} from "../../client/src/components/extensions/db-workbench/workbench-session.ts";
import { buildSqlLibraryEntries } from "../../client/src/components/extensions/db-workbench/sql-library.ts";

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

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test.beforeEach(() => {
  installWindowWithStorage();
});

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("buildQueryRunEntryFromResponse summarizes multi-statement outcomes", () => {
  const summary = buildQueryRunEntryFromResponse(
    "SELECT 1; SELECT broken;",
    "script",
    {
      requestId: "query-1",
      batches: [
        {
          sql: "SELECT 1",
          columns: [],
          rows: [],
          totalRows: 1,
          returnedRows: 1,
          hasMore: false,
          pagingMode: "none",
          elapsedMs: 3,
        },
        {
          sql: "SELECT broken",
          columns: [],
          rows: [],
          totalRows: null,
          returnedRows: 0,
          hasMore: false,
          pagingMode: "none",
          elapsedMs: 2,
          error: "unknown column broken",
        },
      ],
    },
  );

  assert.equal(summary.status, "partial");
  assert.equal(summary.statementCount, 2);
  assert.equal(summary.returnedRows, 1);
  assert.equal(summary.elapsedMs, 5);
  assert.equal(summary.failedStatementIndex, 1);
  assert.equal(summary.errorMessage, "unknown column broken");
});

test("recordQueryRun keeps per-run history while deduping recent query text", () => {
  recordQueryRun("conn-history", {
    sql: "SELECT * FROM orders;",
    mode: "statement",
    status: "success",
    statementCount: 1,
    returnedRows: 12,
    elapsedMs: 18,
  });

  recordQueryRun("conn-history", {
    sql: "SELECT * FROM orders;",
    mode: "statement",
    status: "failed",
    statementCount: 1,
    errorMessage: "syntax error at or near FROM",
  });

  const session = loadSessionForConnection("conn-history");
  assert.equal(session.queryHistory.length, 2);
  assert.equal(session.queryHistory[0]?.status, "failed");
  assert.equal(session.queryHistory[1]?.status, "success");
  assert.equal(session.recentQueries.length, 1);
  assert.equal(session.recentQueries[0], "SELECT * FROM orders;");
});

test("sql library prefers run history entries over legacy recent queries when history exists", () => {
  const entries = buildSqlLibraryEntries(
    [],
    ["SELECT * FROM legacy_recent;"],
    [
      {
        id: "run-1",
        sql: "UPDATE orders SET status = 'done';",
        executedAt: "2026-04-12T12:00:00.000Z",
        mode: "script",
        status: "partial",
        statementCount: 3,
        returnedRows: 0,
        affectedRows: 4,
        elapsedMs: 222,
        failedStatementIndex: 1,
        errorMessage: "foreign key violation",
      },
    ],
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, "history");
  assert.equal(entries[0]?.groupLabel, "Run history");
  assert.equal(entries[0]?.status, "partial");
  assert.match(entries[0]?.meta ?? "", /Script/);
  assert.match(entries[0]?.meta ?? "", /failed @ #2/);
});

test("workbench layout wires run history persistence into SQL library state", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const sqlWorkspaceContext = await read(
    "client/src/components/extensions/db-workbench/workbench-sql-workspace-context.ts",
  );
  const contextModels = await read(
    "client/src/components/extensions/db-workbench/use-workbench-context-models.ts",
  );
  const layoutContextModels = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-context-models.ts",
  );
  const queryRuntime = await read(
    "client/src/components/extensions/db-workbench/query-execution-runtime.ts",
  );
  const queryRunner = await read(
    "client/src/components/extensions/db-workbench/query-execution-runner.ts",
  );
  const queryExecutionController = await read(
    "client/src/components/extensions/db-workbench/workbench-query-execution-controller.ts",
  );
  const queryControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
  );
  const executionRegistry = await read(
    "client/src/components/extensions/db-workbench/workbench-execution-action-registry.ts",
  );
  const stateActionRegistries = await read(
    "client/src/components/extensions/db-workbench/use-workbench-state-action-registries.ts",
  );
  const executionStateActionsHook = await read(
    "client/src/components/extensions/db-workbench/use-workbench-execution-state-actions.ts",
  );
  const layoutStateActionInput = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-state-action-input.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutQueryControllers\(\{/);
  assert.match(queryControllers, /createWorkbenchQueryExecutionController\(\{/);
  assert.match(queryExecutionController, /runWorkbenchQueryExecution\(\{/);
  assert.match(controllerGraph, /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/);
  assert.match(stateActionRegistries, /useWorkbenchExecutionStateActions\(input\)/);
  assert.match(executionStateActionsHook, /createWorkbenchExecutionStateActions\(\{/);
  assert.match(executionRegistry, /createQueryExecutionStateActions\(\{/);
  assert.match(queryExecutionController, /applySuccess: input\.queryExecutionActions\.applySuccess/);
  assert.match(queryRunner, /recordSuccessfulQueryExecution\(/);
  assert.match(queryRunner, /applySession\(input\.session\);/);
  assert.match(queryRuntime, /recordQueryRun/);
  assert.match(layoutStateActionInput, /setQueryHistory: sqlWorkspaceState\.setQueryHistory/);
  assert.match(queryRunner, /input\.setQueryHistory\(session\.queryHistory\);/);
  assert.match(controllerGraph, /useWorkbenchLayoutContextModels\(\{/);
  assert.match(layoutContextModels, /useWorkbenchContextModels\(\{/);
  assert.match(contextModels, /buildWorkbenchSqlWorkspaceContext\(sqlWorkspace\)/);
  assert.match(layoutContextModels, /queryHistory: sqlWorkspaceState\.queryHistory/);
  assert.match(sqlWorkspaceContext, /buildSqlLibraryEntries\(\s*input\.savedSnippets,\s*input\.recentQueries,\s*input\.queryHistory,\s*\)/);
});
