import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const inputHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-state-action-registry-input.ts",
  "utf8",
);
const layoutInputHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-state-action-input.ts",
  "utf8",
);
const registriesHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-state-action-registries.ts",
  "utf8",
);
const executionStateActionsHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-execution-state-actions.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench state action registry input memoization is outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutStateActionInput\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/);
  assert.doesNotMatch(layoutSource, /useWorkbenchStateActionRegistryInput\(\{/);
  assert.doesNotMatch(layoutSource, /setSyncTargetConnectionId,\s*\n\s*\}/);
  assert.doesNotMatch(layoutSource, /const stateActionRegistriesInput = useMemo\(/);

  assert.match(layoutInputHookSource, /useWorkbenchStateActionRegistryInput\(\{/);
  assert.match(layoutInputHookSource, /setSyncTargetConnectionId: syncWorkspaceState\.setSyncTargetConnectionId/);
  assert.match(inputHookSource, /useMemo\(/);
  assert.match(inputHookSource, /input\.setSyncTargetConnectionId/);
  assert.match(registriesHookSource, /useWorkbenchExecutionStateActions\(input\)/);
  assert.match(executionStateActionsHookSource, /createWorkbenchExecutionStateActions\(\{/);
});
