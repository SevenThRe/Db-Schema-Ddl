import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("runtime classifies supported non-pageable result sets without dropping rows", async () => {
  const runtime = await read("src-tauri/src/db_connector/query.rs");

  assert.match(runtime, /StatementExecutionMode::UnsupportedResultQuery/);
  assert.match(runtime, /result_batch_from_rows\(/);
  assert.match(runtime, /DbQueryPagingMode::Unsupported/);
  assert.match(runtime, /DbQueryPagingMode::None/);
});

test("result grid gates load more on paging mode and still shows loaded-row evidence", async () => {
  const singleBatch = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  );
  const singleBatchRuntime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-runtime.ts",
  );
  const batchModel = await read(
    "client/src/components/extensions/db-workbench/result-grid-batch-model.ts",
  );
  const statusPanels = await read(
    "client/src/components/extensions/db-workbench/result-grid-status-panels.tsx",
  );

  assert.match(singleBatch, /useResultGridSingleBatchRuntime/);
  assert.match(singleBatchRuntime, /buildResultGridBatchMetrics\(batch, filteredCount\)/);
  assert.match(batchModel, /const canLoadMore = batch\.pagingMode === "offset" && batch\.hasMore;/);
  assert.match(batchModel, /const footerStatusLabel =/);
  assert.match(singleBatch, /<ResultGridFooter/);
  assert.match(statusPanels, /footerStatusLabel\}\. \{unsupportedPagingText\}/);
});

test("recent query context is captured and restored per connection", async () => {
  const sessionStore = await read(
    "client/src/components/extensions/db-workbench/workbench-session-history.ts",
  );
  const queryRuntime = await read(
    "client/src/components/extensions/db-workbench/query-execution-runtime.ts",
  );
  const queryRunner = await read(
    "client/src/components/extensions/db-workbench/query-execution-runner.ts",
  );
  const queryExecutionStateActions = await read(
    "client/src/components/extensions/db-workbench/query-execution-state-actions.ts",
  );
  const queryExecutionController = await read(
    "client/src/components/extensions/db-workbench/workbench-query-execution-controller.ts",
  );
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const queryControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
  );
  const sessionEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-session-effects.ts",
  );
  const layoutSessionEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-session-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );
  const layoutStateActionInput = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-state-action-input.ts",
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
  const executionRegistry = await read(
    "client/src/components/extensions/db-workbench/workbench-execution-action-registry.ts",
  );
  const stateActionRegistries = await read(
    "client/src/components/extensions/db-workbench/use-workbench-state-action-registries.ts",
  );
  const executionStateActionsHook = await read(
    "client/src/components/extensions/db-workbench/use-workbench-execution-state-actions.ts",
  );
  const restoreRunner = await read(
    "client/src/components/extensions/db-workbench/workbench-session-restore-runner.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(sessionStore, /const nextRecentQueries = \[trimmedSql, \.\.\.deduped\]\.slice\(0, MAX_RECENT_QUERIES\);/);
  assert.match(workbench, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchLayoutSessionEffects\(\{/);
  assert.match(layoutSessionEffects, /hydrateSession: hydrateConnectionSession/);
  assert.match(sessionEffects, /runWorkbenchConnectionRestore\(\{/);
  assert.match(restoreRunner, /const restored = input\.hydrateSession\(input\.connection\.id\);/);
  assert.match(restoreRunner, /actions\.setRecentQueries\(restored\.recentQueries\);/);
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
  assert.match(queryRuntime, /recordQueryRun/);
  assert.match(queryExecutionStateActions, /applySession\(input\.session\);/);
  assert.match(layoutStateActionInput, /setRecentQueries: sqlWorkspaceState\.setRecentQueries/);
  assert.match(queryExecutionStateActions, /input\.setRecentQueries\(session\.recentQueries\);/);
  assert.match(controllerGraph, /useWorkbenchLayoutContextModels\(\{/);
  assert.match(layoutContextModels, /useWorkbenchContextModels\(\{/);
  assert.match(contextModels, /buildWorkbenchSqlWorkspaceContext\(sqlWorkspace\)/);
  assert.match(layoutContextModels, /recentQueries: sqlWorkspaceState\.recentQueries/);
  assert.match(sqlWorkspaceContext, /buildSqlLibraryEntries\(\s*input\.savedSnippets,\s*input\.recentQueries,\s*input\.queryHistory,\s*\)/);
});
