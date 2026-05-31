import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench tracks inserted row drafts and includes them in prepare/commit review", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const resultWorkspacePane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
  );
  const workspaceBody = await read(
    "client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
  );
  const dialogStack = await read(
    "client/src/components/extensions/db-workbench/WorkbenchDialogStack.tsx",
  );
  const dialogPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-dialog-stack-props.ts",
  );
  const resultWorkspacePropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-result-workspace-props.ts",
  );
  const queryResultsPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-query-results-props.ts",
  );
  const gridEditDrafts = await read(
    "client/src/components/extensions/db-workbench/grid-edit-drafts.ts",
  );
  const gridCommitRuntime = await read(
    "client/src/components/extensions/db-workbench/grid-commit-runtime.ts",
  );
  const gridCommitRunner = await read(
    "client/src/components/extensions/db-workbench/grid-commit-runner.ts",
  );
  const gridEditController = await read(
    "client/src/components/extensions/db-workbench/workbench-grid-edit-controller.ts",
  );
  const runtimeControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-runtime-controllers.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );
  const operatorWorkspaceState = await read(
    "client/src/components/extensions/db-workbench/use-workbench-operator-workspace-state.ts",
  );
  const layoutWorkspaceState = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts",
  );
  const renderPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  );
  const resultWorkspaceLayoutProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-result-workspace-props.ts",
  );
  const dialogStackLayoutProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-dialog-stack-props.ts",
  );
  const layoutRenderProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
  );
  const layoutRenderPropResultInput = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-result-input.ts",
  );

  assert.match(
    operatorWorkspaceState,
    /const \[pendingInsertedRows, setPendingInsertedRows\] =\s+useState<Record<string, DbGridInsertedRowDraft>>\(\{\}\);/,
  );
  assert.match(workbench, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutWorkspaceState, /useWorkbenchOperatorWorkspaceState\(\{/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutRuntimeControllers\(\{/);
  assert.match(runtimeControllers, /createWorkbenchGridEditController\(\{/);
  assert.match(gridEditController, /runPrepareGridCommit\(\{/);
  assert.match(gridCommitRunner, /buildPendingGridCommitDrafts\(/);
  assert.match(gridEditDrafts, /insertedRows: uniqueBy\(/);
  assert.match(gridCommitRuntime, /insertedRows: input\.drafts\.insertedRows,/);
  assert.match(workbench, /<WorkbenchWorkspaceBody/);
  assert.match(workspaceBody, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(resultWorkspacePane, /<WorkbenchQueryResultsPane \{\.\.\.queryResults\} \/>/);
  assert.match(layoutRenderProps, /buildWorkbenchLayoutRenderPropResultInput\(input\)/);
  assert.match(layoutRenderPropResultInput, /pendingInsertedRows: operatorWorkspaceState\.pendingInsertedRows,/);
  assert.match(resultWorkspacePropsBuilder, /queryResults: input\.queryResults,/);
  assert.match(resultWorkspaceLayoutProps, /buildWorkbenchQueryResultsProps\(\{[\s\S]*pendingInsertedRows: input\.pendingInsertedRows,/);
  assert.match(queryResultsPropsBuilder, /primaryKeyColumns: activeBatch\?\.primaryKeyColumns \?\? \[\],/);
  assert.match(dialogStackLayoutProps, /pendingInsertedRows: renderContext\.pendingInsertedRowSummaries,/);
  assert.doesNotMatch(workbench, /const activePrimaryKeyColumns = activeBatch\?\.primaryKeyColumns \?\? \[\];/);
  assert.match(dialogPropsBuilder, /pendingInsertedRows: input\.gridCommit\.pendingInsertedRows,/);
  assert.match(dialogStack, /<GridEditCommitDialog \{\.\.\.gridCommit\} \/>/);
  assert.match(gridCommitRuntime, /prepared\.insertedRows/);
  assert.match(gridCommitRuntime, /result\.insertedRows/);
});

test("result grid exposes add-row drafting affordances for insert review", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const singleBatch = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  );
  const singleBatchRuntime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-runtime.ts",
  );
  const singleBatchEditRuntime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-edit-runtime.ts",
  );
  const rowInspector = await read(
    "client/src/components/extensions/db-workbench/result-grid-row-inspector.tsx",
  );
  const rowModel = await read(
    "client/src/components/extensions/db-workbench/result-grid-row-model.ts",
  );
  const editModel = await read(
    "client/src/components/extensions/db-workbench/result-grid-edit-model.ts",
  );
  const statusPanels = await read(
    "client/src/components/extensions/db-workbench/result-grid-status-panels.tsx",
  );
  const toolbar = await read(
    "client/src/components/extensions/db-workbench/result-grid-toolbar.tsx",
  );
  const cell = await read(
    "client/src/components/extensions/db-workbench/result-grid-cell.tsx",
  );

  assert.match(resultGrid, /<ResultGridSingleBatch/);
  assert.match(singleBatch, /<ResultGridToolbar/);
  assert.match(toolbar, /Add row draft/);
  assert.match(singleBatch, /<PendingMutationBar/);
  assert.match(statusPanels, /Draft inserts highlighted/);
  assert.match(cell, /Omitted from INSERT\. Database default will apply\./);
  assert.match(singleBatch, /from "\.\/result-grid-row-inspector"/);
  assert.match(rowInspector, /Discard draft/);
  assert.match(singleBatch, /useResultGridSingleBatchRuntime/);
  assert.match(singleBatchRuntime, /useResultGridSingleBatchEditActions/);
  assert.match(singleBatchEditRuntime, /from "\.\/result-grid-edit-model"/);
  assert.match(editModel, /parseInsertedValue/);
  assert.match(editModel, /kind: "insert"/);
  assert.match(rowModel, /export function parseInsertedValue/);
});

test("grid edit commit dialog renders pending insert summaries", async () => {
  const dialog = await read(
    "client/src/components/extensions/db-workbench/GridEditCommitDialog.tsx",
  );

  assert.match(dialog, /Pending Row Inserts/);
  assert.match(dialog, /Inserts: \{insertedRows\}/);
});
