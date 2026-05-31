import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const hookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-context-models.ts",
  "utf8",
);
const layoutHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-context-models.ts",
  "utf8",
);
const controllerGraphSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  "utf8",
);

test("workbench context models are composed outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutContextModels\(\{/);
  assert.doesNotMatch(layoutSource, /useWorkbenchContextModels\(\{/);
  assert.doesNotMatch(layoutSource, /syncSchema:\s*\{/);
  assert.match(layoutHookSource, /useWorkbenchContextModels\(\{/);
  assert.match(layoutHookSource, /connectionCount: backendQueries\.connections\.length/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchSyncSchemaContext\(/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchSchemaContext\(/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchSqlCopilotContext\(/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchSqlWorkspaceContext\(/);

  assert.match(hookSource, /buildWorkbenchSyncSchemaContext\(/);
  assert.match(hookSource, /buildWorkbenchSchemaContext\(/);
  assert.match(hookSource, /buildWorkbenchSqlCopilotContext\(/);
  assert.match(hookSource, /buildWorkbenchSqlWorkspaceContext\(/);
});
