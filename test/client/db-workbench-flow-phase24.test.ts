import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db connector shell exposes one primary workspace route and compatibility-only tools", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );
  const connectorShell = await read(
    "client/src/components/extensions/db-workbench/DbConnectorWorkspaceShell.tsx",
  );
  const workspaceTabs = await read(
    "client/src/components/extensions/db-workbench/DbConnectorWorkspaceTabs.tsx",
  );
  const workspaceController = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-controller.ts",
  );
  const workspaceActions = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-actions.ts",
  );
  const workspaceControllerModel = await read(
    "client/src/components/extensions/db-workbench/db-connector-workspace-controller-model.ts",
  );
  const compatibilityViews = await read(
    "client/src/components/extensions/db-workbench/WorkbenchCompatibilityViews.tsx",
  );
  const compatibilityState = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-compatibility-state.ts",
  );
  const connectionState = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-connection-state.ts",
  );
  const runtimeEffects = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-runtime-effects.ts",
  );
  const surfaceInventory = await read("docs/db-workbench-surface-inventory.md");

  assert.match(workspace, /<DbConnectorWorkspaceShell/);
  assert.match(workspace, /<DbConnectorWorkspaceTabs/);
  assert.match(workspace, /useDbConnectorWorkspaceController\(\{/);
  assert.match(connectorShell, /Database Workspace/);
  assert.match(connectorShell, /Compatibility tools/);
  assert.match(workspaceTabs, /<ConnectionCenterView/);
  assert.match(workspaceTabs, /<SchemaCompatibilityView/);
  assert.match(workspaceTabs, /<SchemaDiffCompatibilityView/);
  assert.match(workspaceTabs, /<WorkbenchLayout/);
  assert.match(compatibilityViews, /function SchemaBrowser/);
  assert.match(compatibilityViews, /<DbSchemaDiffViewer/);
  assert.match(workspaceController, /useDbConnectorCompatibilityState/);
  assert.match(workspaceController, /useDbConnectorConnectionState/);
  assert.match(workspaceController, /useDbConnectorWorkspaceRuntimeEffects\(\{/);
  assert.match(workspaceController, /useDbConnectorWorkspaceActions\(\{/);
  assert.match(workspaceController, /db-connector-workspace-controller-model/);
  assert.match(workspaceActions, /export type DbConnectorWorkspaceTabActions/);
  assert.match(workspaceActions, /export function useDbConnectorWorkspaceActions/);
  assert.match(workspaceActions, /openDatabaseWorkspace/);
  assert.match(workspaceActions, /toggleCompatibilityTools/);
  assert.match(workspaceControllerModel, /resolveShellSurface/);
  assert.match(workspaceControllerModel, /buildDuplicateConnectionDraft/);
  assert.match(workspaceController, /shellProps:/);
  assert.match(workspaceController, /tabsProps:/);
  assert.match(workspaceController, /actions: \{/);
  assert.match(workspaceController, /startNewConnectionDraft/);
  assert.match(workspaceTabs, /actions: DbConnectorWorkspaceTabActions/);
  assert.match(workspaceTabs, /onAddConnection=\{actions\.startNewConnectionDraft\}/);
  assert.doesNotMatch(workspaceTabs, /setEditingConfig/);
  assert.doesNotMatch(workspaceTabs, /setWorkspaceView/);
  assert.doesNotMatch(workspaceTabs, /setLegacyToolsOpen/);
  assert.match(compatibilityState, /queryKey: \["\/db\/schema", selectedConnId\]/);
  assert.match(compatibilityState, /host\.connections\.diff\(diffSourceId, diffTargetId\)/);
  assert.match(connectionState, /queryKey: \["\/db\/connections"\]/);
  assert.match(connectionState, /queryKey: \["\/db\/connections\/discover-local"\]/);
  assert.match(connectionState, /buildConnectionGroupSections/);
  assert.match(runtimeEffects, /persistWorkspaceRoute\(activeTabValue, selectedConnId\)/);
  assert.match(runtimeEffects, /subscribeDbConnectorConnectionSelection/);
  assert.match(connectorShell, /legacyToolsOpen \|\| compatibilityToolActive/);
  assert.match(connectorShell, /Resume daily-driver route/);
  assert.match(
    connectorShell,
    /连接管理是辅助面，真正的日常 DB 操作应通过统一的 Database Workspace 完成/,
  );
  assert.match(surfaceInventory, /Retirement criteria/);
  assert.match(surfaceInventory, /Compatibility Schema Diff/);
});

test("workbench layout exposes canonical connection-management callback", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const operatorChrome = await read(
    "client/src/components/extensions/db-workbench/WorkbenchOperatorChrome.tsx",
  );
  const renderPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  );

  assert.match(workbench, /onManageConnections: \(\) => void;/);
  assert.match(workbench, /<WorkbenchOperatorChrome/);
  assert.match(workbench, /<WorkbenchOperatorChrome\s*\{\.\.\.operatorChromeProps\}/);
  assert.match(renderPropsBuilder, /onManageConnections: input\.onManageConnections,/);
  assert.match(operatorChrome, /onClick=\{onManageConnections\}/);
  assert.match(operatorChrome, /Connection Center/);
});
