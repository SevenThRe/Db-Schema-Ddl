import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
  "utf8",
);
const layoutHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-query-controllers.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench query controllers are composed outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutQueryControllers\(\{/);
  assert.doesNotMatch(layoutSource, /useWorkbenchQueryControllers\(\{/);
  assert.match(layoutHookSource, /useWorkbenchQueryControllers\(\{/);
  assert.match(layoutHookSource, /schemaTables: backendQueries\.schemaSnapshot\?\.tables/);
  assert.doesNotMatch(layoutSource, /createWorkbenchQueryExecutionController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchQuerySafetyController\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchRequestLifecycleController\(/);

  assert.match(hookSource, /createWorkbenchQueryExecutionController\(/);
  assert.match(hookSource, /createWorkbenchQuerySafetyController\(/);
  assert.match(hookSource, /createWorkbenchRequestLifecycleController\(/);
  assert.match(hookSource, /previewDangerousSql/);
  assert.match(hookSource, /cancelQuery/);
});
