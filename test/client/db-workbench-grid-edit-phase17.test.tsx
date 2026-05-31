import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("result grid edit controls are fail-closed and lock primary key columns", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const singleBatch = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  );
  const singleBatchRuntime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-runtime.ts",
  );
  const statusPanels = await read(
    "client/src/components/extensions/db-workbench/result-grid-status-panels.tsx",
  );
  const cell = await read(
    "client/src/components/extensions/db-workbench/result-grid-cell.tsx",
  );
  const row = await read(
    "client/src/components/extensions/db-workbench/result-grid-row.tsx",
  );

  assert.match(resultGrid, /<ResultGridSingleBatch/);
  assert.match(singleBatch, /useResultGridSingleBatchRuntime/);
  assert.match(singleBatchRuntime, /const isEditEnabled = editEligibility\?\.eligible === true;/);
  assert.match(singleBatch, /<ResultGridRow/);
  assert.match(row, /<ResultGridCell/);
  assert.match(cell, /Primary key column \(read-only\)/);
  assert.match(singleBatch, /<PendingMutationBar/);
  assert.match(statusPanels, /Pending changes:/);
  assert.match(statusPanels, /disabled=\{!isEditEnabled \|\| pendingMutationCount === 0\}/);
});

test("count-mode starter results remain read-only for edits", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const navigationRunner = await read(
    "client/src/components/extensions/db-workbench/workbench-navigation-runner.ts",
  );
  const navigationController = await read(
    "client/src/components/extensions/db-workbench/workbench-navigation-controller.ts",
  );
  const workflowControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-workflow-controllers.ts",
  );
  const navigationWorkflowController = await read(
    "client/src/components/extensions/db-workbench/use-workbench-navigation-workflow-controller.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );
  const connectionSidebar = await read(
    "client/src/components/extensions/db-workbench/ConnectionSidebar.tsx",
  );
  const tableStructure = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-table-structure.tsx",
  );
  const gridEditRuntime = await read(
    "client/src/components/extensions/db-workbench/grid-edit-runtime.ts",
  );

  assert.match(connectionSidebar, /<ConnectionSidebarTableStructure/);
  assert.match(tableStructure, /Count rows/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutWorkflowControllers\(\{/);
  assert.match(workflowControllers, /useWorkbenchNavigationWorkflowController\(input\)/);
  assert.match(navigationWorkflowController, /createWorkbenchNavigationController\(\{/);
  assert.match(navigationController, /runStarterTableQuery\(\{/);
  assert.match(navigationRunner, /buildStarterTableQuery/);
  assert.match(
    gridEditRuntime,
    /Count rows results are read-only\. Run Select top 100 to edit rows\./,
  );
});

test("no-op cell changes remove patch entries from pending edit state", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const gridEditDrafts = await read(
    "client/src/components/extensions/db-workbench/grid-edit-drafts.ts",
  );
  const gridEditDraftRunner = await read(
    "client/src/components/extensions/db-workbench/grid-edit-draft-runner.ts",
  );
  const operatorSurfaceRegistry = await read(
    "client/src/components/extensions/db-workbench/workbench-operator-surface-action-registry.ts",
  );
  const stateActionRegistries = await read(
    "client/src/components/extensions/db-workbench/use-workbench-state-action-registries.ts",
  );
  const operatorSurfaceStateActionsHook = await read(
    "client/src/components/extensions/db-workbench/use-workbench-operator-surface-state-actions.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(
    gridEditDrafts,
    /if \(isCellValueEqual\(beforeValue, patch\.nextValue\)\) \{/,
  );
  assert.match(gridEditDrafts, /delete next\[patchKey\];/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/);
  assert.match(stateActionRegistries, /useWorkbenchOperatorSurfaceStateActions\(\{/);
  assert.match(operatorSurfaceStateActionsHook, /createWorkbenchOperatorSurfaceStateActions\(\{/);
  assert.match(operatorSurfaceRegistry, /createGridEditDraftStateActions\(\{/);
  assert.match(gridEditDraftRunner, /clearPreparedPlan: \(\) => input\.setPreparedGridPlan\(null\)/);
});
