import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db connector shell labels canonical and legacy surfaces with explicit product status", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );

  assert.match(workspace, /const shellSurfaceStatus =/);
  assert.match(workspace, /"Primary Support"/);
  assert.match(workspace, /"Primary"/);
  assert.match(workspace, /"Secondary"/);
  assert.match(workspace, /Primary daily-driver surface/);
  assert.match(workspace, /Secondary migration surface/);
  assert.match(workspace, /Connection Center is a primary support surface/);
});

test("workbench result tabs mark sync and jobs as preview surfaces", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /Sync\s*<span className="ml-1 text-\[10px\] uppercase text-muted-foreground">\s*Preview/);
  assert.match(workbench, /Jobs\s*<span className="ml-1 text-\[10px\] uppercase text-muted-foreground">\s*Preview/);
  assert.match(workbench, /Preview surface · source -&gt; target/);
  assert.match(workbench, /Preview surface · persistent background job history/);
});

test("db workbench design doc records primary secondary and preview surface taxonomy", async () => {
  const design = await read("docs/db-workbench-extension-design.md");

  assert.match(design, /`Primary`/);
  assert.match(design, /`Primary Support`/);
  assert.match(design, /`Secondary`/);
  assert.match(design, /`Preview`/);
  assert.match(design, /`Database Workspace`：`Primary`/);
  assert.match(design, /legacy `Schema \/ Diff`：`Secondary`/);
  assert.match(design, /`Data Sync \/ Job Center`：`Preview`/);
});
