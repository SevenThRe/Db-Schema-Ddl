import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-connection-restore-actions.ts",
  "utf8",
);
const layoutHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-connection-restore-actions.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench connection restore actions are composed outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutConnectionRestoreActions\(\{/);
  assert.doesNotMatch(layoutSource, /useWorkbenchConnectionRestoreActions\(\{/);
  assert.doesNotMatch(layoutSource, /createWorkbenchConnectionRestoreActions\(\{/);

  assert.match(layoutHookSource, /useWorkbenchConnectionRestoreActions\(\{/);
  assert.match(layoutHookSource, /setTabs: sqlWorkspaceState\.setTabs/);
  assert.match(layoutHookSource, /setApplyUnsafeDeleteConfirmed:\s*\n\s*syncWorkspaceState\.setApplyUnsafeDeleteConfirmed/);
  assert.match(hookSource, /createWorkbenchConnectionRestoreActions\(input\)/);
  assert.match(hookSource, /input\.setTabs/);
  assert.match(hookSource, /input\.setApplyUnsafeDeleteConfirmed/);
});
