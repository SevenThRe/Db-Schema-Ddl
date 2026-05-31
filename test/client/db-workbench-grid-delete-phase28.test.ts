import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench tracks staged delete rows and includes them in prepare/commit review", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
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
  const layoutRenderProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
  );
  const layoutRenderPropResultInput = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-result-input.ts",
  );

  assert.match(workbench, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutWorkspaceState, /useWorkbenchOperatorWorkspaceState\(\{/);
  assert.match(operatorWorkspaceState, /const \[pendingDeleteRows, setPendingDeleteRows\] =\s+useState<Record<string, DbGridDeleteRowDraft>>\(\{\}\);/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutRuntimeControllers\(\{/);
  assert.match(runtimeControllers, /createWorkbenchGridEditController\(\{/);
  assert.match(gridEditController, /runPrepareGridCommit\(\{/);
  assert.match(gridCommitRunner, /buildPendingGridCommitDrafts\(/);
  assert.match(gridEditDrafts, /deletedRows: uniqueBy\(\s*Object\.values\(pendingDeleteRows\),/);
  assert.match(gridCommitRuntime, /deletedRows: input\.drafts\.deletedRows,/);
  assert.match(workbench, /<WorkbenchWorkspaceBody/);
  assert.match(workspaceBody, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(resultWorkspacePane, /<WorkbenchQueryResultsPane \{\.\.\.queryResults\} \/>/);
  assert.match(resultWorkspaceLayoutProps, /pendingDeletedRows: renderContext\.pendingDeletedRows,/);
  assert.match(resultWorkspacePropsBuilder, /queryResults: input\.queryResults,/);
  assert.match(resultWorkspaceLayoutProps, /buildWorkbenchQueryResultsProps\(\{[\s\S]*pendingDeleteRows: input\.pendingDeleteRows,/);
  assert.match(queryResultsPropsBuilder, /editEligibility: activeEditEligibility,/);
  assert.match(layoutRenderProps, /buildWorkbenchLayoutRenderPropResultInput\(input\)/);
  assert.match(layoutRenderPropResultInput, /pendingDeleteRows: operatorWorkspaceState\.pendingDeleteRows,/);
  assert.doesNotMatch(workbench, /const activeEditEligibility = activeBatch\?\.editEligibility;/);
});

test("result grid exposes staged delete affordances and mixed pending-change summaries", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const singleBatch = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  );
  const rowInspector = await read(
    "client/src/components/extensions/db-workbench/result-grid-row-inspector.tsx",
  );
  const statusPanels = await read(
    "client/src/components/extensions/db-workbench/result-grid-status-panels.tsx",
  );

  assert.match(resultGrid, /<ResultGridSingleBatch/);
  assert.match(singleBatch, /from "\.\/result-grid-row-inspector"/);
  assert.match(rowInspector, /Stage delete/);
  assert.match(rowInspector, /Revert delete/);
  assert.match(singleBatch, /<PendingRowSummaries/);
  assert.match(singleBatch, /<PendingMutationBar/);
  assert.match(statusPanels, /Pending row deletes/);
  assert.match(statusPanels, /Delete-staged rows highlighted/);
  assert.match(statusPanels, /disabled=\{!isEditEnabled \|\| pendingMutationCount === 0\}/);
});
