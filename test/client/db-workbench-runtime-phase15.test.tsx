import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("result grid keeps backend-driven paging state and unsupported load-more copy", async () => {
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
  assert.match(
    statusPanels,
    /Load \{loadMoreCount\.toLocaleString\(\)\} more rows/,
  );
  assert.match(batchModel, /const isPagingUnsupported = batch\.pagingMode === "unsupported";/);
  assert.match(
    batchModel,
    /Load more unavailable for this result\./,
  );
  assert.match(batchModel, /Unknown total/);
});

test("runtime export menu exposes current page, loaded rows, and full result scopes", async () => {
  const exportMenu = await read(
    "client/src/components/extensions/db-workbench/ResultExportMenu.tsx",
  );

  assert.match(exportMenu, /Current page/);
  assert.match(exportMenu, /Loaded rows/);
  assert.match(exportMenu, /Full result/);
  assert.match(
    exportMenu,
    /Only single pageable SELECT-style results support full result export\./,
  );
});

test("workbench runtime path wires paging offsets, backend export, and full-result warning", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const queryControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
  );
  const resultWorkspaceController = await read(
    "client/src/components/extensions/db-workbench/workbench-result-workspace-controller.ts",
  );
  const loadMoreRuntime = await read(
    "client/src/components/extensions/db-workbench/result-load-more-runtime.ts",
  );
  const loadMoreRunner = await read(
    "client/src/components/extensions/db-workbench/result-load-more-runner.ts",
  );
  const exportRuntime = await read(
    "client/src/components/extensions/db-workbench/result-export-runtime.ts",
  );
  const exportRunner = await read(
    "client/src/components/extensions/db-workbench/result-export-runner.ts",
  );
  const requestLifecycleRunner = await read(
    "client/src/components/extensions/db-workbench/request-lifecycle-runner.ts",
  );
  const requestLifecycleController = await read(
    "client/src/components/extensions/db-workbench/workbench-request-lifecycle-controller.ts",
  );
  const runtimeControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-runtime-controllers.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutRuntimeControllers\(\{/);
  assert.match(runtimeControllers, /createWorkbenchResultWorkspaceController\(\{/);
  assert.match(resultWorkspaceController, /runResultLoadMore\(\{/);
  assert.match(loadMoreRunner, /validateLoadMoreBatch\(batch\)/);
  assert.match(loadMoreRunner, /buildFetchMoreRequest\(\{/);
  assert.match(loadMoreRuntime, /batch\.pagingMode !== "offset" \|\| !batch\.hasMore/);
  assert.match(loadMoreRuntime, /offset: input\.batch\.nextOffset/);
  assert.match(resultWorkspaceController, /runWorkbenchResultExport\(\{/);
  assert.match(exportRunner, /exportRows: \(request: ExportRowsRequest\)/);
  assert.match(exportRunner, /buildExportRowsPayload\(activeBatch, input\.scope\)/);
  assert.match(exportRuntime, /currentPageRows: scope === "current_page"/);
  assert.match(exportRuntime, /loadedRows: scope === "loaded_rows" \? batch\.rows : undefined/);
  assert.match(
    exportRuntime,
    /Full result export may be truncated at 100000 rows\./,
  );
  assert.match(controllerGraph, /useWorkbenchLayoutQueryControllers\(\{/);
  assert.match(queryControllers, /createWorkbenchRequestLifecycleController\(\{/);
  assert.match(requestLifecycleController, /runWorkbenchCancellation\(\{/);
  assert.match(requestLifecycleRunner, /const requestId = queryRequestId \?\? exportRequestId;/);
});

test("result grid stop-on-error toggle is controlled by the workbench state", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const queryResultsPane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchQueryResultsPane.tsx",
  );
  const explainPane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchExplainPane.tsx",
  );
  const resultWorkspacePane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
  );
  const workspaceBody = await read(
    "client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
  );
  const resultWorkspacePropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-result-workspace-props.ts",
  );
  const queryResultsPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-query-results-props.ts",
  );
  const workspaceBodyPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-workspace-body-props.ts",
  );
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const layoutRenderProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
  );
  const layoutRenderPropExecutionInput = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-execution-input.ts",
  );

  assert.match(resultGrid, /stopOnError: boolean;/);
  assert.doesNotMatch(resultGrid, /const \[stopOnError, setStopOnError\] = useState/);
  assert.match(queryResultsPane, /<ResultGridPane \{\.\.\.gridProps\} \/>/);
  assert.match(queryResultsPane, /Current query could not be started/);
  assert.match(explainPane, /<ExplainPlanPane plan=\{plan\} isLoading=\{isLoading\} \/>/);
  assert.match(explainPane, /Execution plan is unavailable/);
  assert.match(workbench, /<WorkbenchWorkspaceBody \{\.\.\.workspaceBodyProps\} \/>/);
  assert.match(workspaceBody, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(workspaceBodyPropsBuilder, /isExecuting: input\.isExecuting \|\| input\.isExporting,/);
  assert.match(workspaceBodyPropsBuilder, /sql: input\.activeTabSql,/);
  assert.match(workspaceBodyPropsBuilder, /dialect: input\.connection\.driver,/);
  assert.match(resultWorkspacePane, /<WorkbenchQueryResultsPane \{\.\.\.queryResults\} \/>/);
  assert.match(resultWorkspacePane, /<WorkbenchExplainPane \{\.\.\.explain\} \/>/);
  assert.match(layoutRenderProps, /buildWorkbenchLayoutRenderPropExecutionInput\(input\)/);
  assert.match(layoutRenderPropExecutionInput, /stopOnError: executionWorkspaceState\.stopOnError,/);
  assert.match(resultWorkspacePropsBuilder, /queryResults: input\.queryResults,/);
  assert.match(resultWorkspacePropsBuilder, /explain: input\.explain,/);
  assert.match(queryResultsPropsBuilder, /batches: results\?\.batches \?\? \[\],/);
  assert.match(queryResultsPropsBuilder, /tableSchema: activeEditableTable,/);
  assert.doesNotMatch(workbench, /const activeEditableTable =/);
});
