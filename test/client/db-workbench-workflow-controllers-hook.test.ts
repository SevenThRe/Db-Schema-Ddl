import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-workflow-controllers.ts",
  "utf8",
);
const navigationWorkflowControllerSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-navigation-workflow-controller.ts",
  "utf8",
);
const inspectionDiffWorkflowControllerSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-inspection-diff-workflow-controller.ts",
  "utf8",
);
const syncJobWorkflowControllerSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-sync-job-workflow-controller.ts",
  "utf8",
);
const layoutHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-workflow-controllers.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench workflow controllers are composed outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutWorkflowControllers\(\{/);
  assert.doesNotMatch(layoutSource, /useWorkbenchWorkflowControllers\(\{/);
  assert.match(layoutHookSource, /useWorkbenchWorkflowControllers\(\{/);
  assert.match(layoutHookSource, /executeQuery: async \(sql, source\) => \{/);
  assert.doesNotMatch(layoutSource, /createWorkbenchNavigationController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchInspectionDiffController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchSyncJobController\(/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchSyncJobContext\(/);

  assert.match(hookSource, /useWorkbenchNavigationWorkflowController\(input\)/);
  assert.match(hookSource, /useWorkbenchInspectionDiffWorkflowController\(input\)/);
  assert.match(hookSource, /useWorkbenchSyncJobWorkflowController\(input\)/);
  assert.match(
    navigationWorkflowControllerSource,
    /createWorkbenchNavigationController\(/,
  );
  assert.match(
    inspectionDiffWorkflowControllerSource,
    /createWorkbenchInspectionDiffController\(/,
  );
  assert.match(syncJobWorkflowControllerSource, /createWorkbenchSyncJobController\(/);
  assert.match(syncJobWorkflowControllerSource, /buildWorkbenchSyncJobContext\(/);
  assert.match(syncJobWorkflowControllerSource, /createBrowserDataApplyPollingTimer/);
  assert.match(navigationWorkflowControllerSource, /invalidateConnectionQueries/);
});
