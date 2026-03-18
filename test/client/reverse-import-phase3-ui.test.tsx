import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("reverse-import workspace exposes bundle and oracle subset source modes", async () => {
  const workspace = await read("client/src/components/ddl-import/DdlImportWorkspace.tsx");

  assert.match(workspace, /粘贴 SQL/);
  assert.match(workspace, /上传 SQL 文件/);
  assert.match(workspace, /上传 SQL bundle/);
  assert.match(workspace, /Oracle subset 粘贴/);
  assert.match(workspace, /Oracle subset 文件/);
});

test("reverse-import workspace keeps the approved three-column contract", async () => {
  const workspace = await read("client/src/components/ddl-import/DdlImportWorkspace.tsx");
  const dashboard = await read("client/src/pages/Dashboard.tsx");
  const generator = await read("client/src/components/DdlGenerator.tsx");

  assert.match(workspace, /导入来源/);
  assert.match(workspace, /结构审阅/);
  assert.match(workspace, /问题与导出/);
  assert.match(workspace, /存在有损项|有损项/);
  assert.match(workspace, /不受支持项/);
  assert.match(workspace, /导出 XLSX 并加入文件列表/);
  assert.match(workspace, /SQL bundle 只用于结构导向 reverse import/);
  assert.match(workspace, /Oracle support is subset-based/);

  assert.match(dashboard, /DdlImportWorkspace/);
  assert.match(generator, /onOpenImportWorkspace/);
});

test("reverse-import workspace preserves file-first handoff and source mode activation seams", async () => {
  const workspace = await read("client/src/components/ddl-import/DdlImportWorkspace.tsx");
  const hooks = await read("client/src/hooks/use-ddl.ts");

  assert.match(workspace, /onActivateFile/);
  assert.match(workspace, /handleOpenUploadPicker/);
  assert.match(workspace, /sourceMode/);
  assert.match(workspace, /previewMutation/);
  assert.match(workspace, /exportMutation/);

  assert.match(hooks, /usePreviewDdlImport/);
  assert.match(hooks, /useExportWorkbookFromDdl/);
});
