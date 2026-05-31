import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { splitSqlStatements } from "../../client/src/components/extensions/db-workbench/sql-statements.ts";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("client-side statement splitting ignores comments and quoted semicolons", () => {
  const sql = `
    -- comment ; ignored
    SELECT 'a;b';
    UPDATE users SET active = false WHERE id = 1;
    /* block ; ignored */
    SHOW TABLES;
  `;

  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 3);
  assert.equal(statements[0]?.kind, "select");
  assert.equal(statements[1]?.kind, "dml");
  assert.equal(statements[2]?.kind, "show");
  assert.match(statements[0]?.summary ?? "", /SELECT 'a;b'/);
});

test("workbench exposes script review flow before multi-statement execution", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const gates = await read(
    "client/src/components/extensions/db-workbench/query-execution-gates.ts",
  );
  const safetyRunner = await read(
    "client/src/components/extensions/db-workbench/query-safety-runner.ts",
  );
  const safetyController = await read(
    "client/src/components/extensions/db-workbench/workbench-query-safety-controller.ts",
  );
  const queryControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-query-controllers.ts",
  );
  const executionRegistry = await read(
    "client/src/components/extensions/db-workbench/workbench-execution-action-registry.ts",
  );
  const stateActionRegistries = await read(
    "client/src/components/extensions/db-workbench/use-workbench-state-action-registries.ts",
  );
  const executionStateActionsHook = await read(
    "client/src/components/extensions/db-workbench/use-workbench-execution-state-actions.ts",
  );
  const editor = await read(
    "client/src/components/extensions/db-workbench/SqlEditorPane.tsx",
  );
  const editorToolbar = await read(
    "client/src/components/extensions/db-workbench/sql-editor-toolbar.tsx",
  );
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
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutQueryControllers\(\{/);
  assert.match(queryControllers, /createWorkbenchQuerySafetyController\(\{/);
  assert.match(safetyController, /runExecuteScriptWithReview\(/);
  assert.match(controllerGraph, /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/);
  assert.match(stateActionRegistries, /useWorkbenchExecutionStateActions\(input\)/);
  assert.match(executionStateActionsHook, /createWorkbenchExecutionStateActions\(\{/);
  assert.match(executionRegistry, /createQuerySafetyStateActions\(\{/);
  assert.match(safetyRunner, /buildPendingSqlScriptReview\(input\.sql\)/);
  assert.match(gates, /splitSqlStatements\(sql\)/);
  assert.match(safetyRunner, /applyScriptReview: input\.setPendingScriptReview/);
  assert.match(queryControllers, /actions: input\.querySafetyStateActions/);
  assert.match(workbench, /<WorkbenchDialogStack \{\.\.\.dialogStackProps\} \/>/);
  assert.match(workbench, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilder, /buildWorkbenchLayoutDialogStackProps\(\{/);
  assert.match(dialogPropsBuilder, /open: pendingScriptReview !== null,/);
  assert.match(dialogInputBuilder, /sqlScriptReview: input\.sqlScriptReview,/);
  assert.match(dialogStack, /<SqlScriptReviewDialog \{\.\.\.sqlScriptReview\} \/>/);
  assert.match(editor, /<SqlEditorToolbar/);
  assert.match(editorToolbar, /Run script/);
  assert.match(editorToolbar, /Run script \(Shift\+Ctrl\+Enter\)/);
});

test("result grid surfaces multi-statement script summary and failed-statement jump affordance", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const batchNavigation = await read(
    "client/src/components/extensions/db-workbench/result-grid-batch-navigation.tsx",
  );

  assert.match(resultGrid, /from "\.\/result-grid-batch-navigation"/);
  assert.match(batchNavigation, /Script summary/);
  assert.match(batchNavigation, /Jump to failed statement/);
  assert.match(batchNavigation, /All statements completed without statement-level failures/);
});
