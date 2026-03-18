import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("Phase 3 hooks expose DDL import preview and workbook export actions", async () => {
  const hooks = await read("client/src/hooks/use-ddl.ts");

  assert.match(hooks, /usePreviewDdlImport/);
  assert.match(hooks, /useExportWorkbookFromDdl/);
  assert.match(hooks, /previewImport/);
  assert.match(hooks, /exportWorkbook/);
});

test("Phase 3 workspace ships as a dedicated three-column DDL import flow", async () => {
  const workspace = await read("client/src/components/ddl-import/DdlImportWorkspace.tsx");
  const dashboard = await read("client/src/pages/Dashboard.tsx");
  const generator = await read("client/src/components/DdlGenerator.tsx");

  assert.match(workspace, /DDL Import to XLSX/);
  assert.match(workspace, /导入来源/);
  assert.match(workspace, /结构审阅/);
  assert.match(workspace, /问题与导出/);
  assert.match(workspace, /usePreviewDdlImport/);
  assert.match(workspace, /useExportWorkbookFromDdl/);
  assert.match(workspace, /button-export-ddl-workbook/);

  assert.match(dashboard, /DdlImportWorkspace/);
  assert.match(dashboard, /DDL Import/);
  assert.match(generator, /onOpenImportWorkspace/);
});
