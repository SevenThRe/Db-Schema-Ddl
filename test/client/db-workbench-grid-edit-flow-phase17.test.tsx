import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("prepare commit routes pending patch payload through prepareGridCommit", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const commitRuntime = await read(
    "client/src/components/extensions/db-workbench/grid-commit-runtime.ts",
  );
  const commitRunner = await read(
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

  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutRuntimeControllers\(\{/);
  assert.match(runtimeControllers, /createWorkbenchGridEditController\(\{/);
  assert.match(gridEditController, /runPrepareGridCommit\(\{/);
  assert.match(commitRunner, /prepareGridCommit\(buildResult\.request\)/);
  assert.match(commitRuntime, /patchCells: input\.drafts\.patchCells/);
  assert.match(commitRuntime, /primaryKeyColumns,/);
});

test("prepared preview must be explicitly confirmed before commitGridEdits", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const dialogStack = await read(
    "client/src/components/extensions/db-workbench/WorkbenchDialogStack.tsx",
  );
  const dialogPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-dialog-stack-props.ts",
  );
  const dialogInputBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-dialog-stack-input.ts",
  );
  const renderPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  );
  const dialogStackLayoutProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-dialog-stack-props.ts",
  );
  const layoutRenderPropsHook = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
  );
  const layoutRenderPropActionInput = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-action-input.ts",
  );
  const layoutRenderPropControllerActionInput = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-controller-action-input.ts",
  );
  const layoutRenderPropRuntimeActionInput = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-prop-runtime-action-input.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(workbench, /<WorkbenchDialogStack \{\.\.\.dialogStackProps\} \/>/);
  assert.match(workbench, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilder, /buildWorkbenchLayoutDialogStackProps\(\{/);
  assert.match(dialogStackLayoutProps, /buildWorkbenchDialogStackInput\(\{/);
  assert.match(dialogStackLayoutProps, /buildWorkbenchDialogStackProps\(/);
  assert.match(dialogStack, /<GridEditCommitDialog \{\.\.\.gridCommit\} \/>/);
  assert.match(dialogPropsBuilder, /open: preparedPlan !== null,/);
  assert.match(dialogInputBuilder, /gridCommit: input\.gridCommit,/);
  assert.match(layoutRenderPropsHook, /buildWorkbenchLayoutRenderPropActionInput\(input\)/);
  assert.match(layoutRenderPropActionInput, /buildWorkbenchLayoutRenderPropControllerActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInput, /buildWorkbenchLayoutRenderPropRuntimeActionInput\(input\)/);
  assert.match(layoutRenderPropRuntimeActionInput, /handleCommitGridEdits: runtimeControllers\.handleCommitGridEdits,/);
  assert.match(dialogStackLayoutProps, /onConfirm: input\.handleCommitGridEdits,/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutRuntimeControllers\(\{/);
  const gridEditController = await read(
    "client/src/components/extensions/db-workbench/workbench-grid-edit-controller.ts",
  );
  const runtimeControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-runtime-controllers.ts",
  );
  assert.match(runtimeControllers, /createWorkbenchGridEditController\(\{/);
  assert.match(gridEditController, /runCommitGridEdits\(\{/);
  const commitRunner = await read(
    "client/src/components/extensions/db-workbench/grid-commit-runner.ts",
  );
  assert.match(commitRunner, /commitGridEdits\(\s+buildGridCommitRequest\(/);
});

test("discard path clears local patches and does not call commit api", async () => {
  const draftRunner = await read(
    "client/src/components/extensions/db-workbench/grid-edit-draft-runner.ts",
  );
  const gridEditController = await read(
    "client/src/components/extensions/db-workbench/workbench-grid-edit-controller.ts",
  );
  const discardBlock =
    gridEditController.match(/handleDiscardGridEdits: \(\) => \{[\s\S]*?\},/)?.[0] ??
    "";

  assert.ok(discardBlock.length > 0, "Expected handleDiscardGridEdits block");
  assert.match(discardBlock, /runDiscardGridEditDrafts\(input\.draftActions\)/);
  assert.match(draftRunner, /export function runDiscardGridEditDrafts/);
  assert.match(draftRunner, /updateEditCells\(\(\) => \(\{\}\)\)/);
  assert.match(draftRunner, /updateDeleteRows\(\(\) => \(\{\}\)\)/);
  assert.match(draftRunner, /updateInsertedRows\(\(\) => \(\{\}\)\)/);
  assert.match(draftRunner, /clearPreparedPlan\(\)/);
  assert.equal(/commitGridEdits/.test(discardBlock), false);
});

test("successful commit path refreshes active table query and keeps discard action visible", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const singleBatch = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  );
  const statusPanels = await read(
    "client/src/components/extensions/db-workbench/result-grid-status-panels.tsx",
  );
  const commitRunner = await read(
    "client/src/components/extensions/db-workbench/grid-commit-runner.ts",
  );
  const runtimeControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-runtime-controllers.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(runtimeControllers, /refreshTable: \(tableName\) => input\.handleRunStarterQuery\(tableName, "select"\)/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutRuntimeControllers\(\{/);
  assert.match(runtimeControllers, /createWorkbenchGridEditController\(\{/);
  assert.match(commitRunner, /await input\.refreshTable\(input\.selectedTableName\)/);
  assert.match(resultGrid, /<ResultGridSingleBatch/);
  assert.match(singleBatch, /<PendingMutationBar/);
  assert.match(statusPanels, /Discard edits/);
});
