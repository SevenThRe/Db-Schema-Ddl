import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db connector shell labels canonical and compatibility surfaces with explicit product status", async () => {
  const workspaceController = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-controller.ts",
  );
  const workspaceControllerModel = await read(
    "client/src/components/extensions/db-workbench/db-connector-workspace-controller-model.ts",
  );
  const workspaceRoute = await read(
    "client/src/components/extensions/db-workbench/workbench-workspace-route.ts",
  );
  const connectionCenter = await read(
    "client/src/components/extensions/db-workbench/connection-center-header.tsx",
  );

  assert.match(workspaceController, /workbench-workspace-route/);
  assert.match(workspaceController, /resolveShellSurface/);
  assert.match(workspaceControllerModel, /WORKSPACE_SURFACE_META/);
  assert.match(workspaceRoute, /const WORKSPACE_SURFACE_META:/);
  assert.match(workspaceRoute, /"Primary Support"/);
  assert.match(workspaceRoute, /"Primary"/);
  assert.match(workspaceRoute, /"Compatibility"/);
  assert.match(workspaceRoute, /Daily-driver route/);
  assert.match(workspaceRoute, /Compatibility-only surface/);
  assert.match(connectionCenter, /Connection Center is a primary support surface/);
});

test("workbench result tabs keep sync as preview while job history is shipped support", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const resultHeader = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspaceHeader.tsx",
  );
  const resultWorkspacePane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
  );
  const workspaceBody = await read(
    "client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
  );

  assert.match(workbench, /<WorkbenchWorkspaceBody/);
  assert.match(workspaceBody, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(resultWorkspacePane, /<WorkbenchResultWorkspaceHeader \{\.\.\.header\} \/>/);
  assert.match(resultHeader, /Sync\s*<span className="ml-1 text-\[10px\] uppercase text-muted-foreground">\s*Preview/);
  assert.match(resultHeader, /Preview surface · source -&gt; target/);
  assert.match(resultHeader, /Shipped support surface · persistent background job history/);
});

test("db workbench design doc records primary compatibility and preview surface taxonomy", async () => {
  const design = await read("docs/db-workbench-extension-design.md");

  assert.match(design, /Current runtime truth/);
  assert.match(design, /`Primary`/);
  assert.match(design, /`Primary Support`/);
  assert.match(design, /`Compatibility`/);
  assert.match(design, /`Preview`/);
  assert.match(design, /`Database Workspace`：`Primary`/);
  assert.match(design, /legacy `Schema \/ Diff`：`Compatibility`/);
  assert.match(design, /`Data Sync`：`Preview`/);
  assert.match(design, /`Job Center`：`Shipped`/);
});
