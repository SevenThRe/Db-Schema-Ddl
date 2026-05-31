import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-runtime-controllers.ts",
  "utf8",
);
const layoutHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-runtime-controllers.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench runtime controllers are composed outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutRuntimeControllers\(\{/);
  assert.doesNotMatch(layoutSource, /useWorkbenchRuntimeControllers\(\{/);
  assert.match(layoutHookSource, /useWorkbenchRuntimeControllers\(\{/);
  assert.match(layoutHookSource, /activeBatchIndex: resultWorkspaceState\.activeBatchIndex/);
  assert.doesNotMatch(layoutSource, /createWorkbenchGridEditController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchResultWorkspaceController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchLiveVerificationRunner\(/);
  assert.doesNotMatch(layoutSource, /downloadBinaryResult/);
  assert.doesNotMatch(layoutSource, /sleepWithBrowserTimer/);

  assert.match(hookSource, /createWorkbenchGridEditController\(/);
  assert.match(hookSource, /createWorkbenchResultWorkspaceController\(/);
  assert.match(hookSource, /createWorkbenchLiveVerificationRunner\(/);
  assert.match(hookSource, /downloadBinaryResult/);
  assert.match(hookSource, /sleepWithBrowserTimer/);
});
