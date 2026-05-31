import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbenchPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
);
const dataSyncPanePath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchDataSyncPane.tsx",
);
const dataSyncApplyPanelPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchDataSyncApplyPanel.tsx",
);
const runtimeHelperPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/data-apply-runtime.ts",
);
const dataSyncUtilsPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/data-sync-utils.ts",
);
const dataSyncRunnerPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/data-sync-runner.ts",
);
const dataApplyRunnerPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/data-apply-runner.ts",
);
const syncJobControllerPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-sync-job-controller.ts",
);
const dataSyncPropsBuilderPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-data-sync-props.ts",
);
const workbenchSource = readFileSync(workbenchPath, "utf8");
const controllerGraphSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  ),
  "utf8",
);
const workflowControllersSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/use-workbench-workflow-controllers.ts",
  ),
  "utf8",
);
const syncJobWorkflowControllerSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/use-workbench-sync-job-workflow-controller.ts",
  ),
  "utf8",
);
const dataSyncPaneSource = readFileSync(dataSyncPanePath, "utf8");
const dataSyncApplyPanelSource = readFileSync(dataSyncApplyPanelPath, "utf8");
const runtimeHelperSource = readFileSync(runtimeHelperPath, "utf8");
const dataSyncUtilsSource = readFileSync(dataSyncUtilsPath, "utf8");
const dataSyncRunnerSource = readFileSync(dataSyncRunnerPath, "utf8");
const dataApplyRunnerSource = readFileSync(dataApplyRunnerPath, "utf8");
const syncJobControllerSource = readFileSync(syncJobControllerPath, "utf8");
const dataSyncPropsBuilderSource = readFileSync(dataSyncPropsBuilderPath, "utf8");

test("data sync flow keeps compare then preview then execute ordering", () => {
  assert.match(workbenchSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutWorkflowControllers\(\{/);
  assert.match(workflowControllersSource, /useWorkbenchSyncJobWorkflowController\(input\)/);
  assert.match(syncJobWorkflowControllerSource, /createWorkbenchSyncJobController\(\{/);
  const compareIndex = syncJobControllerSource.indexOf("runDataDiffPreview(");
  const previewApplyIndex = syncJobControllerSource.indexOf("runDataApplyPreview(");
  const executeApplyIndex = syncJobControllerSource.indexOf("runDataApplyExecute(");

  assert.ok(compareIndex >= 0, "runDataDiffPreview should be wired");
  assert.match(dataSyncRunnerSource, /previewDataDiff\(\{/);
  assert.ok(previewApplyIndex >= 0, "runDataApplyPreview should be wired");
  assert.match(dataApplyRunnerSource, /previewDataApply\(\{/);
  assert.ok(executeApplyIndex >= 0, "runDataApplyExecute should be wired");
  assert.match(dataApplyRunnerSource, /executeDataApply\(/);
  assert.ok(
    compareIndex < previewApplyIndex && previewApplyIndex < executeApplyIndex,
    "expected compare -> preview apply -> execute apply flow",
  );
});

test("stale artifact guards block execution and force rerun compare", () => {
  assert.match(dataSyncPropsBuilderSource, /hasBlockingDataSyncBlocker/);
  assert.doesNotMatch(workbenchSource, /hasBlockingDataSyncBlocker/);
  assert.match(dataSyncUtilsSource, /target_snapshot_changed/);
  assert.match(dataSyncUtilsSource, /artifact_expired/);
  assert.match(dataSyncUtilsSource, /Re-run compare/);
});

test("unsafe_delete_threshold warning is surfaced before execute", () => {
  assert.match(dataSyncUtilsSource, /unsafe_delete_threshold/);
  assert.match(dataSyncApplyPanelSource, /warning is active/);
});

test("prod typed confirmation gate is required before execute call", () => {
  assert.match(dataSyncApplyPanelSource, /typed confirmation required for prod target/);
  assert.match(
    dataSyncPropsBuilderSource,
    /applyProdConfirmation\.trim\(\) ===\s*input\.activeSyncTargetConnection\.database/,
  );
  assert.doesNotMatch(workbenchSource, /const syncRequiresProdTypedConfirmation =/);
});

test("execute job detail loader stays reachable after execution", () => {
  assert.match(syncJobControllerSource, /startDataApplyJobPolling\(\{/);
  assert.match(dataApplyRunnerSource, /fetchDataApplyJobDetail\(/);
  assert.match(dataSyncPaneSource, /<WorkbenchDataSyncApplyPanel/);
  assert.match(dataSyncApplyPanelSource, /Open Job Center/);
  assert.match(runtimeHelperSource, /Review job detail/);
  assert.match(runtimeHelperSource, /Open Job Center/);
});
