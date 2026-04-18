import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("host route contract no longer exposes panelId for extension surfaces", async () => {
  const hostApi = await read("client/src/extensions/host-api.ts");
  const dashboard = await read("client/src/pages/Dashboard.tsx");
  const workspaceHost = await read("client/src/extensions/ExtensionWorkspaceHost.tsx");
  const registry = await read("client/src/extensions/panel-registry.ts");

  assert.doesNotMatch(hostApi, /panelId\?: string/);
  assert.doesNotMatch(dashboard, /panelId:/);
  assert.doesNotMatch(workspaceHost, /panelId\?: string/);
  assert.doesNotMatch(registry, /panelId\?: string/);
  assert.match(workspaceHost, /surfaceNotFound/);
});

test("ddl import hands users to the database tool boundary instead of assuming a builtin DB area", async () => {
  const ddlImport = await read("client/src/components/ddl-import/DdlImportWorkspace.tsx");
  const dashboard = await read("client/src/pages/Dashboard.tsx");

  assert.match(ddlImport, /onOpenDatabaseTool\?: \(\) => void;/);
  assert.match(ddlImport, /databaseToolInstalled\?: boolean;/);
  assert.match(ddlImport, /databaseToolLabel\?: string;/);
  assert.match(ddlImport, /前往工具管理/);
  assert.match(ddlImport, /打开 \$\{databaseToolLabel\}/);
  assert.match(dashboard, /databaseToolActivity/);
  assert.match(dashboard, /setActiveSurface\(\{ kind: "extensions" \}\)/);
});

test("host copy now speaks in tool/workspace terms and boundary docs describe canonical shell surfaces", async () => {
  const sidebar = await read("client/src/extensions/shell/ExtensionSecondarySidebar.tsx");
  const zh = await read("client/src/i18n/locales/zh.json");
  const ja = await read("client/src/i18n/locales/ja.json");
  const boundarySpec = await read("docs/extension-boundary-spec.md");

  assert.match(sidebar, /extensions\.shell\.tool/);
  assert.match(sidebar, /extensions\.shell\.workspace/);
  assert.match(zh, /"subtitle": "Excel \/ DDL \/ Diff \/ Tools"/);
  assert.match(ja, /"subtitle": "Excel \/ DDL \/ Diff \/ Tools"/);
  assert.match(boundarySpec, /canonical shell contract 是 `activityBar \+ sidebarViews \+ workbenchViews`/);
  assert.match(boundarySpec, /workbenchViewId/);
});
