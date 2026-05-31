import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("query execution contracts carry cursorOffset through preview and execution paths", async () => {
  const sharedSchema = await read("shared/schema.ts");
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const queryControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
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
  const querySafetyRunner = await read(
    "client/src/components/extensions/db-workbench/query-safety-runner.ts",
  );
  const runtime = await read("src-tauri/src/db_connector/query.rs");
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(sharedSchema, /cursorOffset\?: number;/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutQueryControllers\(\{/);
  assert.match(queryControllers, /createWorkbenchQueryExecutionController\(\{/);
  assert.match(queryExecutionController, /runWorkbenchQueryExecution\(\{/);
  assert.match(queryRunner, /buildQueryExecutionRequest\(\{/);
  assert.match(queryRunner, /cursorOffset: input\.cursorOffset,/);
  assert.match(queryRuntime, /cursorOffset: input\.cursorOffset,/);
  assert.match(queryRuntime, /schema: input\.runtimeSchema \?\? undefined,/);
  assert.match(queryExecutionController, /runPreviewAndExecuteSql\(\{/);
  assert.match(queryControllers, /previewDangerousSql: \(sqlToPreview, previewCursorOffset\) =>/);
  assert.match(queryControllers, /input\.hostApi\.connections\.previewDangerousSql\(\s*input\.connection\.id,\s*sqlToPreview,\s*previewCursorOffset,\s*\)/);
  assert.match(querySafetyRunner, /previewDangerousSql\(input\.sql, input\.cursorOffset\)/);
  assert.match(querySafetyRunner, /input\.executeImmediate\(\s*input\.sql,\s*false,\s*input\.source,\s*input\.mode,\s*input\.cursorOffset,\s*\)/);
  assert.match(runtime, /resolve_target_sql_statements\(&request\.sql, request\.cursor_offset\)/);
  assert.match(runtime, /request\.cursor_offset\.is_some\(\)/);
});

test("workbench ignores stale query and export responses after cancel or superseding requests", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const requestLifecycleRuntime = await read(
    "client/src/components/extensions/db-workbench/request-lifecycle-runtime.ts",
  );
  const requestLifecycleRunner = await read(
    "client/src/components/extensions/db-workbench/request-lifecycle-runner.ts",
  );
  const requestLifecycleController = await read(
    "client/src/components/extensions/db-workbench/workbench-request-lifecycle-controller.ts",
  );
  const queryControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
  );
  const operatorWorkspaceState = await read(
    "client/src/components/extensions/db-workbench/use-workbench-operator-workspace-state.ts",
  );
  const layoutWorkspaceState = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts",
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
  const queryRunner = await read(
    "client/src/components/extensions/db-workbench/query-execution-runner.ts",
  );
  const exportRunner = await read(
    "client/src/components/extensions/db-workbench/result-export-runner.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(workbench, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutWorkspaceState, /useWorkbenchOperatorWorkspaceState\(\{/);
  assert.match(operatorWorkspaceState, /const activeQueryRequestIdRef = useRef<string \| null>\(null\);/);
  assert.match(operatorWorkspaceState, /const activeExportRequestIdRef = useRef<string \| null>\(null\);/);
  assert.match(queryRunner, /shouldIgnoreWorkbenchResponse\(\{/);
  assert.match(queryRunner, /shouldFinalizeWorkbenchRequest\(\{/);
  assert.match(exportRunner, /shouldIgnoreWorkbenchResponse\(\{/);
  assert.match(exportRunner, /shouldFinalizeWorkbenchRequest\(\{/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutQueryControllers\(\{/);
  assert.match(queryControllers, /createWorkbenchRequestLifecycleController\(\{/);
  assert.match(requestLifecycleController, /runWorkbenchCancellation\(\{/);
  assert.match(controllerGraph, /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/);
  assert.match(stateActionRegistries, /useWorkbenchExecutionStateActions\(input\)/);
  assert.match(executionStateActionsHook, /createWorkbenchExecutionStateActions\(\{/);
  assert.match(executionRegistry, /createRequestLifecycleStateActions\(\{/);
  assert.match(requestLifecycleRunner, /resolveWorkbenchCancellationTargets\(\{/);
  assert.match(requestLifecycleRuntime, /activeRequestId === requestId/);
  assert.match(requestLifecycleRuntime, /!isActiveWorkbenchRequest/);
  assert.match(requestLifecycleRunner, /clearQueryRequest: \(\) => \{\s*input\.setActiveQueryRequestId\(null\);\s*input\.setIsExecuting\(false\);\s*input\.setCurrentRequestId\(null\);/);
  assert.match(requestLifecycleRunner, /clearExportRequest: \(\) => \{\s*input\.setActiveExportRequestId\(null\);\s*input\.setIsExporting\(false\);\s*input\.setCurrentExportRequestId\(null\);/);
  assert.match(requestLifecycleController, /clearQueryRequest: input\.actions\.clearQueryRequest/);
  assert.match(requestLifecycleController, /clearExportRequest: input\.actions\.clearExportRequest/);
});
