import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-state-action-registries.ts",
  "utf8",
);
const sqlHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-sql-state-actions.ts",
  "utf8",
);
const executionHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-execution-state-actions.ts",
  "utf8",
);
const syncHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-sync-state-actions.ts",
  "utf8",
);
const operatorSurfaceHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-operator-surface-state-actions.ts",
  "utf8",
);
const typeSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-state-action-registry-types.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench state action registries are assembled outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(
    controllerGraphSource,
    /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/,
  );
  assert.doesNotMatch(layoutSource, /createWorkbenchSqlStateActions\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchExecutionStateActions\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchSyncStateActions\(/);
  assert.doesNotMatch(layoutSource, /createWorkbenchOperatorSurfaceStateActions\(/);

  assert.match(hookSource, /useWorkbenchSqlStateActions\(input\)/);
  assert.match(hookSource, /useWorkbenchExecutionStateActions\(input\)/);
  assert.match(hookSource, /useWorkbenchSyncStateActions\(\{/);
  assert.match(hookSource, /useWorkbenchOperatorSurfaceStateActions\(\{/);
  assert.doesNotMatch(hookSource, /createWorkbenchSqlStateActions\(/);
  assert.doesNotMatch(hookSource, /createWorkbenchExecutionStateActions\(/);
  assert.doesNotMatch(hookSource, /createWorkbenchSyncStateActions\(/);
  assert.doesNotMatch(hookSource, /createWorkbenchOperatorSurfaceStateActions\(/);

  assert.match(sqlHookSource, /createWorkbenchSqlStateActions\(/);
  assert.match(executionHookSource, /createWorkbenchExecutionStateActions\(/);
  assert.match(syncHookSource, /createWorkbenchSyncStateActions\(/);
  assert.match(operatorSurfaceHookSource, /createWorkbenchOperatorSurfaceStateActions\(/);
  assert.match(typeSource, /export interface UseWorkbenchStateActionRegistriesInput/);
  assert.match(typeSource, /export interface WorkbenchStateActionRegistries/);
});
