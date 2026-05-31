import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-sql-controllers.ts",
  "utf8",
);
const layoutHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-sql-controllers.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench SQL controllers are composed outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutSqlControllers\(\{/);
  assert.match(layoutHookSource, /useWorkbenchSqlControllers\(\{/);
  assert.doesNotMatch(layoutSource, /createWorkbenchSqlMemoryController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchSqlLibraryController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchSqlCopilotController\(/);

  assert.match(hookSource, /createWorkbenchSqlMemoryController\(/);
  assert.match(hookSource, /createWorkbenchSqlLibraryController\(/);
  assert.match(hookSource, /createWorkbenchSqlCopilotController\(/);
  assert.match(hookSource, /recordAcceptedSqlSuggestion/);
  assert.match(hookSource, /desktopBridge\.settings\.update/);
});
