import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  detectSqlParameters,
  renderSqlParameters,
} from "../../client/src/components/extensions/db-workbench/sql-parameters.ts";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("detects :name and {{name}} placeholders while ignoring strings, comments, and ::casts", () => {
  const sql = `
    -- :ignored
    SELECT *
    FROM users
    WHERE id = :user_id
      AND created_at::date = {{target_date}}
      AND note = ':still_ignored'
      AND body <> 'hello {{ignored}}'
      /* {{ignored_block}} */
  `;

  const parameters = detectSqlParameters(sql);
  assert.deepEqual(
    parameters.map((parameter) => parameter.name),
    ["user_id", "target_date"],
  );
});

test("renders SQL literals, raw expressions, and preserves the targeted cursor statement offset", () => {
  const sql = "SELECT * FROM users WHERE id = :user_id;\nDELETE FROM users WHERE created_at < {{cutoff}};";
  const originalCursor = sql.indexOf("DELETE");
  const rendered = renderSqlParameters(
    sql,
    {
      user_id: { rawValue: "42" },
      cutoff: { rawValue: "=NOW() - INTERVAL '30 days'" },
    },
    originalCursor,
  );

  assert.match(rendered.sql, /id = 42/);
  assert.match(rendered.sql, /created_at < NOW\(\) - INTERVAL '30 days'/);
  assert.equal(typeof rendered.cursorOffset, "number");
  assert.ok((rendered.cursorOffset ?? 0) >= rendered.sql.indexOf("DELETE"));
});

test("workbench execution path pauses for parameter review and resumes through the dialog", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const gates = await read(
    "client/src/components/extensions/db-workbench/query-execution-gates.ts",
  );
  const safetyRunner = await read(
    "client/src/components/extensions/db-workbench/query-safety-runner.ts",
  );
  const safetyStateActions = await read(
    "client/src/components/extensions/db-workbench/query-safety-state-actions.ts",
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
  assert.match(safetyController, /runExecuteWithParameterGate\(/);
  assert.match(controllerGraph, /useWorkbenchStateActionRegistries\(stateActionRegistriesInput\)/);
  assert.match(stateActionRegistries, /useWorkbenchExecutionStateActions\(input\)/);
  assert.match(executionStateActionsHook, /createWorkbenchExecutionStateActions\(\{/);
  assert.match(executionRegistry, /createQuerySafetyStateActions\(\{/);
  assert.match(safetyRunner, /buildPendingSqlParameterReview\(/);
  assert.match(gates, /detectSqlParameters\(input\.sql\)/);
  assert.match(safetyStateActions, /applyParameterReview: input\.setPendingParameterReview/);
  assert.match(queryControllers, /actions: input\.querySafetyStateActions/);
  assert.match(workbench, /<WorkbenchDialogStack \{\.\.\.dialogStackProps\} \/>/);
  assert.match(workbench, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilder, /buildWorkbenchLayoutDialogStackProps\(\{/);
  assert.match(dialogPropsBuilder, /open: pendingParameterReview !== null,/);
  assert.match(dialogPropsBuilder, /renderedSqlPreview:/);
  assert.match(dialogInputBuilder, /sqlParameters: input\.sqlParameters,/);
  assert.match(dialogStack, /<SqlParametersDialog \{\.\.\.sqlParameters\} \/>/);
  assert.match(safetyRunner, /await input\.previewAndExecuteSql\(/);
});
