import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dataSyncRowDiffToStructuredEntry,
  type DataSyncRowDiffEntry,
} from "../../client/src/components/extensions/db-workbench/data-sync-row-diff.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbenchPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
);
const workbenchSource = readFileSync(workbenchPath, "utf8");
const shellModelSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  ),
  "utf8",
);
const renderPropsBuilderPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
);
const renderPropsBuilderSource = readFileSync(renderPropsBuilderPath, "utf8");
const resultWorkspaceLayoutPropsPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-result-workspace-props.ts",
);
const resultWorkspaceLayoutPropsSource = readFileSync(
  resultWorkspaceLayoutPropsPath,
  "utf8",
);
const workspaceBodyLayoutPropsPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-workspace-body-props.ts",
);
const workspaceBodyLayoutPropsSource = readFileSync(
  workspaceBodyLayoutPropsPath,
  "utf8",
);
const layoutRenderPropsHookPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
);
const layoutRenderPropsHookSource = readFileSync(layoutRenderPropsHookPath, "utf8");
const layoutRenderPropActionInputPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-action-input.ts",
);
const layoutRenderPropActionInputSource = readFileSync(
  layoutRenderPropActionInputPath,
  "utf8",
);
const layoutRenderPropControllerActionInputPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-controller-action-input.ts",
);
const layoutRenderPropControllerActionInputSource = readFileSync(
  layoutRenderPropControllerActionInputPath,
  "utf8",
);
const layoutRenderPropWorkflowActionInputPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-workflow-action-input.ts",
);
const layoutRenderPropWorkflowActionInputSource = readFileSync(
  layoutRenderPropWorkflowActionInputPath,
  "utf8",
);
const workspaceBodyPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
);
const workspaceBodySource = readFileSync(workspaceBodyPath, "utf8");
const dataSyncPanePath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchDataSyncPane.tsx",
);
const dataSyncPaneSource = readFileSync(dataSyncPanePath, "utf8");
const dataSyncSetupPanelSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/WorkbenchDataSyncSetupPanel.tsx",
  ),
  "utf8",
);
const dataSyncSetupSectionsSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/workbench-data-sync-setup-sections.tsx",
  ),
  "utf8",
);
const dataSyncDiffBrowserSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/WorkbenchDataSyncDiffBrowser.tsx",
  ),
  "utf8",
);
const dataSyncApplyPanelSource = readFileSync(
  path.resolve(
    __dirname,
    "../../client/src/components/extensions/db-workbench/WorkbenchDataSyncApplyPanel.tsx",
  ),
  "utf8",
);
const resultHeaderPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchResultWorkspaceHeader.tsx",
);
const resultHeaderSource = readFileSync(resultHeaderPath, "utf8");
const resultWorkspacePanePath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
);
const resultWorkspacePaneSource = readFileSync(resultWorkspacePanePath, "utf8");
const dataSyncPropsBuilderPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-data-sync-props.ts",
);
const dataSyncPropsBuilderSource = readFileSync(dataSyncPropsBuilderPath, "utf8");
const secondaryPanePropsBuilderPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-secondary-pane-props.ts",
);
const secondaryPanePropsBuilderSource = readFileSync(secondaryPanePropsBuilderPath, "utf8");
const workspaceBodyPropsBuilderPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-workspace-body-props.ts",
);
const workspaceBodyPropsBuilderSource = readFileSync(workspaceBodyPropsBuilderPath, "utf8");
const syncJobControllerPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-sync-job-controller.ts",
);
const syncJobControllerSource = readFileSync(syncJobControllerPath, "utf8");
const dataSyncUtilsPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/data-sync-utils.ts",
);
const dataSyncUtilsSource = readFileSync(dataSyncUtilsPath, "utf8");
const backendQueriesPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/use-workbench-backend-queries.ts",
);
const backendQueriesSource = readFileSync(backendQueriesPath, "utf8");
const connectionRoutingPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/workbench-connection-routing.ts",
);
const connectionRoutingSource = readFileSync(connectionRoutingPath, "utf8");
const syncWorkspaceStateHookPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/use-workbench-sync-workspace-state.ts",
);
const syncWorkspaceStateHookSource = readFileSync(syncWorkspaceStateHookPath, "utf8");
const layoutWorkspaceStateHookPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts",
);
const layoutWorkspaceStateHookSource = readFileSync(layoutWorkspaceStateHookPath, "utf8");
const controllerGraphPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
);
const controllerGraphSource = readFileSync(controllerGraphPath, "utf8");

function makeEntry(status: DataSyncRowDiffEntry["status"]): DataSyncRowDiffEntry {
  return {
    tableName: "users",
    rowKey: { id: 1 },
    status,
    suggestedAction:
      status === "source_only"
        ? "insert"
        : status === "target_only"
          ? "delete"
          : "update",
    sourceRow: { id: 1, name: "alice" },
    targetRow: { id: 1, name: status === "value_changed" ? "bob" : "alice" },
    fieldDiffs: [
      {
        columnName: "name",
        sourceValue: "alice",
        targetValue: status === "value_changed" ? "bob" : "alice",
        changed: status === "value_changed",
      },
    ],
  };
}

test("sync compare summary keeps source -> target direction copy", () => {
  assert.match(workbenchSource, /<WorkbenchWorkspaceBody/);
  assert.match(workspaceBodySource, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(resultWorkspacePaneSource, /<WorkbenchResultWorkspaceHeader \{\.\.\.header\} \/>/);
  assert.match(resultHeaderSource, /source -&gt; target/);
  assert.match(dataSyncPaneSource, /<WorkbenchDataSyncSetupPanel/);
  assert.match(dataSyncSetupPanelSource, /<DataSyncRouteSummary/);
  assert.match(dataSyncSetupSectionsSource, /source -&gt; target/);
});

test("sync tab delegates operator UI to dedicated data sync pane", () => {
  assert.match(resultWorkspacePaneSource, /<WorkbenchDataSyncPane \{\.\.\.sync\} \/>/);
  assert.match(shellModelSource, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilderSource, /buildWorkbenchLayoutResultWorkspaceProps\(\{/);
  assert.match(resultWorkspaceLayoutPropsSource, /buildWorkbenchConnectionContext\(\{/);
  assert.match(renderPropsBuilderSource, /buildWorkbenchLayoutWorkspaceBodyProps\(\{/);
  assert.match(workspaceBodyLayoutPropsSource, /buildWorkbenchWorkspaceBodyProps\(\{/);
  assert.match(workbenchSource, /<WorkbenchWorkspaceBody \{\.\.\.workspaceBodyProps\} \/>/);
  assert.doesNotMatch(workbenchSource, /const syncConnectionOptions =/);
  assert.doesNotMatch(workbenchSource, /sidebar=\{\{/);
  assert.match(workspaceBodyPropsBuilderSource, /void input\.sidebar\.refetchSchema\(\);/);
  assert.match(workspaceBodyPropsBuilderSource, /input\.connection\.driver === "postgres"/);
  assert.match(resultWorkspaceLayoutPropsSource, /schemaDiff: secondaryPaneProps\.schemaDiff,/);
  assert.match(secondaryPanePropsBuilderSource, /void input\.schemaDiff\.onCompare\(\);/);
  assert.doesNotMatch(workbenchSource, /onCompare: \(\) => \{\s*void handlePreviewSchemaDiff\(\);/);
  assert.match(resultWorkspaceLayoutPropsSource, /sync: buildWorkbenchDataSyncProps\(\{/);
  assert.match(dataSyncPropsBuilderSource, /canExecuteDataApply/);
  assert.match(layoutRenderPropsHookSource, /buildWorkbenchLayoutRenderPropActionInput\(input\)/);
  assert.match(layoutRenderPropActionInputSource, /buildWorkbenchLayoutRenderPropControllerActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropWorkflowActionInput\(input\)/);
  assert.match(layoutRenderPropWorkflowActionInputSource, /handlePreviewDataDiff: workflowControllers\.handlePreviewDataDiff,/);
  assert.match(resultWorkspaceLayoutPropsSource, /onPreviewDataDiff: input\.handlePreviewDataDiff,/);
  assert.match(dataSyncPaneSource, /export function WorkbenchDataSyncPane/);
  assert.match(dataSyncPaneSource, /<WorkbenchDataSyncSetupPanel/);
  assert.match(dataSyncPaneSource, /<WorkbenchDataSyncDiffBrowser/);
  assert.match(dataSyncPaneSource, /<WorkbenchDataSyncApplyPanel/);
  assert.match(dataSyncApplyPanelSource, /onExecuteDataApply/);
  assert.doesNotMatch(dataSyncPaneSource, /Compare Summary/);
  assert.doesNotMatch(dataSyncPaneSource, /Row Deltas/);
  assert.match(dataSyncDiffBrowserSource, /Compare Summary/);
  assert.match(dataSyncDiffBrowserSource, /Row Deltas/);
});

test("sync compare requires distinct source and target connections", () => {
  assert.match(
    dataSyncUtilsSource,
    /Source and target connections must be different for sync compare\./,
  );
  assert.match(
    dataSyncUtilsSource,
    /Add a second saved connection before running sync compare\./,
  );
  assert.match(
    connectionRoutingSource,
    /currentTargetConnectionId !== sourceConnectionId/,
  );
});

test("row diff status maps source_only target_only value_changed into structured actions", () => {
  const sourceOnly = dataSyncRowDiffToStructuredEntry(makeEntry("source_only"));
  const targetOnly = dataSyncRowDiffToStructuredEntry(makeEntry("target_only"));
  const valueChanged = dataSyncRowDiffToStructuredEntry(makeEntry("value_changed"));

  assert.equal(sourceOnly.action, "added");
  assert.equal(targetOnly.action, "removed");
  assert.equal(valueChanged.action, "modified");
});

test("unchanged rows stay hidden by default and can be toggled", () => {
  assert.match(
    syncWorkspaceStateHookSource,
    /const \[syncIncludeUnchanged, setSyncIncludeUnchanged\] = useState\(false\)/,
  );
  assert.match(shellModelSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutWorkspaceStateHookSource, /useWorkbenchSyncWorkspaceState\(connection\.id\)/);
  assert.match(dataSyncPaneSource, /<WorkbenchDataSyncDiffBrowser/);
  assert.match(dataSyncDiffBrowserSource, /include unchanged/);
  assert.match(syncJobControllerSource, /includeUnchanged: input\.includeUnchanged/);
});

test("sync compare hydrates source and target schema metadata independently", () => {
  assert.match(shellModelSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchBackendQueries\(\{/);
  assert.match(
    backendQueriesSource,
    /queryKey: \["db-workbench-sync-schema", syncSourceConnectionId\]/,
  );
  assert.match(
    backendQueriesSource,
    /queryKey: \["db-workbench-sync-schema", syncTargetConnectionId\]/,
  );
  assert.match(dataSyncSetupSectionsSource, /Loading source\/target schema metadata for sync compare\./);
});

test("sync compare request forwards key compare and filter overrides", () => {
  const dataSyncRunnerSource = readFileSync(
    path.resolve(
      __dirname,
      "../../client/src/components/extensions/db-workbench/data-sync-runner.ts",
    ),
    "utf8",
  );
  const workflowControllersSource = readFileSync(
    path.resolve(
      __dirname,
      "../../client/src/components/extensions/db-workbench/use-workbench-workflow-controllers.ts",
    ),
    "utf8",
  );
  const syncJobWorkflowControllerSource = readFileSync(
    path.resolve(
      __dirname,
      "../../client/src/components/extensions/db-workbench/use-workbench-sync-job-workflow-controller.ts",
    ),
    "utf8",
  );

  assert.match(shellModelSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutWorkflowControllers\(\{/);
  assert.match(workflowControllersSource, /useWorkbenchSyncJobWorkflowController\(input\)/);
  assert.match(syncJobWorkflowControllerSource, /createWorkbenchSyncJobController\(\{/);
  assert.match(syncJobControllerSource, /runDataDiffPreview\(\{/);
  assert.match(
    dataSyncRunnerSource,
    /buildDataDiffTableRequests\(tables, input\.syncTableConfigs\)/,
  );
  assert.match(
    dataSyncUtilsSource,
    /keyColumns: keyColumns\.length > 0 \? keyColumns : undefined/,
  );
  assert.match(
    dataSyncUtilsSource,
    /compareColumns:\s+compareColumns\.length > 0 \? compareColumns : undefined/,
  );
  assert.match(
    dataSyncUtilsSource,
    /whereClause: whereClause \? whereClause : undefined/,
  );
  assert.match(dataSyncSetupSectionsSource, /No stable key was detected from schema metadata\./);
});
