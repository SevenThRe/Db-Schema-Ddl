import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db management hooks expose live DB workbook export seams", async () => {
  const hooks = await read("client/src/hooks/use-db-management.ts");
  const routes = await read("shared/routes.ts");

  assert.match(hooks, /DB_MANAGEMENT_VIEW_MODES/);
  assert.match(hooks, /"live-export"/);
  assert.match(hooks, /usePreviewLiveDbWorkbookExport/);
  assert.match(hooks, /useExecuteLiveDbWorkbookExport/);

  assert.match(routes, /previewLiveExport:/);
  assert.match(routes, /executeLiveExport:/);
});

test("shared schema keeps live export artifact machine-friendly for future MCP flows", async () => {
  const schemaSource = await read("shared/schema.ts");

  assert.match(schemaSource, /dbLiveExportPreviewArtifactSchema/);
  assert.match(schemaSource, /artifactKey/);
  assert.match(schemaSource, /resolvedSnapshotHash/);
  assert.match(schemaSource, /selectedTableNames/);
  assert.match(schemaSource, /templateId/);
  assert.match(schemaSource, /issueSummary/);
  assert.match(schemaSource, /canExport/);
});

test("live export workspace follows the approved three-column review contract", async () => {
  const workspace = await read("client/src/components/db-management/DbLiveExportWorkspace.tsx");

  assert.match(workspace, /使用最近 snapshot/);
  assert.match(workspace, /导出前刷新 live/);
  assert.match(workspace, /表选择/);
  assert.match(workspace, /导出准备/);
  assert.match(workspace, /存在有损项/);
  assert.match(workspace, /生成 XLSX 工作簿/);
  assert.match(workspace, /还没有可导出的数据库目录/);
  assert.match(workspace, /导出未完成。请先处理阻断项，或切换 freshness 后重新读取目录。/);
});

test("db management workspace and dashboard wire live export as a first-class DB view", async () => {
  const workspace = await read("client/src/components/db-management/DbManagementWorkspace.tsx");
  const dashboard = await read("client/src/pages/Dashboard.tsx");

  assert.match(workspace, /DbLiveExportWorkspace/);
  assert.match(workspace, /TabsTrigger value="live-export"/);
  assert.match(workspace, /TabsContent value="live-export"/);
  assert.match(dashboard, /onActivateFile=\{\(fileId\) => \{/);
  assert.match(dashboard, /setSelectedFileId\(fileId\)/);
  assert.match(dashboard, /setActiveModule\("workspace"\)/);
});
