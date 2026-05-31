import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  "utf8",
);
const renderPropsSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  "utf8",
);
const renderPropsContractSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-props-contract.ts",
  "utf8",
);
const resultWorkspaceLayoutPropsSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-result-workspace-props.ts",
  "utf8",
);
const workspaceBodyLayoutPropsSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-workspace-body-props.ts",
  "utf8",
);
const dialogStackLayoutPropsSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-dialog-stack-props.ts",
  "utf8",
);
const layoutRenderPropsHookSource = readFileSync(
  "client/src/components/extensions/db-workbench/use-workbench-layout-render-props.ts",
  "utf8",
);
const layoutRenderPropInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
  "utf8",
);
const layoutRenderPropExecutionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-execution-input.ts",
  "utf8",
);
const layoutRenderPropResultInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-result-input.ts",
  "utf8",
);
const layoutRenderPropSchemaInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-schema-input.ts",
  "utf8",
);
const layoutRenderPropSqlInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-sql-input.ts",
  "utf8",
);
const layoutRenderPropSyncInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-sync-input.ts",
  "utf8",
);
const layoutRenderPropActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-action-input.ts",
  "utf8",
);
const layoutRenderPropControllerActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-controller-action-input.ts",
  "utf8",
);
const layoutRenderPropQueryActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-query-action-input.ts",
  "utf8",
);
const layoutRenderPropRuntimeActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-runtime-action-input.ts",
  "utf8",
);
const layoutRenderPropSqlActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-sql-action-input.ts",
  "utf8",
);
const layoutRenderPropTabActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-tab-action-input.ts",
  "utf8",
);
const layoutRenderPropWorkflowActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-workflow-action-input.ts",
  "utf8",
);
const layoutRenderPropStateActionInputSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-state-action-input.ts",
  "utf8",
);
const layoutRenderPropGroupsSource = readFileSync(
  "client/src/components/extensions/db-workbench/workbench-layout-render-prop-groups.ts",
  "utf8",
);

test("workbench render prop composition is outside the layout shell", () => {
  assert.match(layoutSource, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(layoutRenderPropsHookSource, /buildWorkbenchLayoutRenderProps\(/);
  assert.match(layoutRenderPropsHookSource, /buildWorkbenchLayoutRenderPropInput\(input\)/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchRenderContext\(\{/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchConnectionContext\(\{/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchResultWorkspaceProps\(\{/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchWorkspaceBodyProps\(\{/);
  assert.doesNotMatch(layoutSource, /buildWorkbenchDialogStackInput\(\{/);

  assert.match(renderPropsSource, /buildWorkbenchRenderContext\(\{/);
  assert.match(renderPropsSource, /buildWorkbenchLayoutResultWorkspaceProps\(\{/);
  assert.match(renderPropsSource, /buildWorkbenchLayoutWorkspaceBodyProps\(\{/);
  assert.match(renderPropsSource, /buildWorkbenchLayoutDialogStackProps\(\{/);
  assert.match(renderPropsContractSource, /export type BuildWorkbenchLayoutRenderPropsInput =/);
  assert.match(renderPropsContractSource, /ReturnType<typeof buildWorkbenchLayoutRenderPropActionInput>/);
  assert.match(renderPropsContractSource, /ReturnType<typeof buildWorkbenchLayoutRenderPropSyncInput>/);
  assert.match(renderPropsContractSource, /export interface WorkbenchLayoutRenderProps/);
  assert.doesNotMatch(renderPropsContractSource, /buildWorkbenchRenderContext\(\{/);
  assert.doesNotMatch(renderPropsContractSource, /buildWorkbenchLayoutResultWorkspaceProps\(\{/);
  assert.match(layoutRenderPropInputSource, /: BuildWorkbenchLayoutRenderPropsInput/);
  assert.match(layoutRenderPropInputSource, /buildWorkbenchLayoutRenderPropActionInput\(input\)/);
  assert.match(layoutRenderPropInputSource, /buildWorkbenchLayoutRenderPropExecutionInput\(input\)/);
  assert.match(layoutRenderPropInputSource, /buildWorkbenchLayoutRenderPropResultInput\(input\)/);
  assert.match(layoutRenderPropInputSource, /buildWorkbenchLayoutRenderPropSchemaInput\(input\)/);
  assert.match(layoutRenderPropInputSource, /buildWorkbenchLayoutRenderPropSqlInput\(input\)/);
  assert.match(layoutRenderPropInputSource, /buildWorkbenchLayoutRenderPropSyncInput\(input\)/);
  assert.match(layoutRenderPropExecutionInputSource, /stopOnError: executionWorkspaceState\.stopOnError/);
  assert.match(layoutRenderPropResultInputSource, /pendingInsertedRows: operatorWorkspaceState\.pendingInsertedRows/);
  assert.match(layoutRenderPropSchemaInputSource, /schemaSnapshot: backendQueries\.schemaSnapshot/);
  assert.match(layoutRenderPropSqlInputSource, /sqlCopilotGeneratedDraft: sqlWorkspaceState\.sqlCopilotGeneratedDraft/);
  assert.match(layoutRenderPropSyncInputSource, /handlePreviewDataDiff|syncTableMetadataByName: syncSchemaContext\.tableMetadataIndex/);
  assert.match(layoutRenderPropActionInputSource, /buildWorkbenchLayoutRenderPropControllerActionInput\(input\)/);
  assert.match(layoutRenderPropActionInputSource, /buildWorkbenchLayoutRenderPropStateActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropQueryActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropRuntimeActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropSqlActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropTabActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropWorkflowActionInput\(input\)/);
  assert.match(layoutRenderPropQueryActionInputSource, /handleExecuteScript: queryControllers\.handleExecuteScript/);
  assert.match(layoutRenderPropRuntimeActionInputSource, /handleCommitGridEdits: runtimeControllers\.handleCommitGridEdits/);
  assert.match(layoutRenderPropSqlActionInputSource, /handleGenerateSqlCopilotDraft/);
  assert.match(layoutRenderPropTabActionInputSource, /handleTabRename: tabController\.handleTabRename/);
  assert.match(layoutRenderPropWorkflowActionInputSource, /handlePreviewDataDiff: workflowControllers\.handlePreviewDataDiff/);
  assert.match(layoutRenderPropStateActionInputSource, /setStopOnError: executionWorkspaceState\.setStopOnError/);
  assert.match(layoutRenderPropGroupsSource, /export interface WorkbenchLayoutRenderPropGroups/);
  assert.match(resultWorkspaceLayoutPropsSource, /buildWorkbenchConnectionContext\(\{/);
  assert.match(resultWorkspaceLayoutPropsSource, /buildWorkbenchResultWorkspaceProps\(\{/);
  assert.match(workspaceBodyLayoutPropsSource, /buildWorkbenchWorkspaceBodyProps\(\{/);
  assert.match(dialogStackLayoutPropsSource, /buildWorkbenchDialogStackInput\(\{/);
  assert.match(layoutRenderPropInputSource, /export function buildWorkbenchLayoutRenderPropInput/);
});
