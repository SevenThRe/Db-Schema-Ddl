import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("table designer panel delegates all DDL generation to the model", async () => {
  const panel = await read(
    "client/src/components/extensions/db-workbench/TableDesignerPanel.tsx",
  );
  const model = await read(
    "client/src/components/extensions/db-workbench/table-designer-model.ts",
  );

  // The panel consumes the model's pure functions instead of building SQL inline.
  assert.match(panel, /from "\.\/table-designer-model"/);
  assert.match(panel, /buildCreateTableDdl/);
  assert.match(panel, /diffTableDraft/);
  assert.match(panel, /tableDesignChangesToScript/);
  assert.match(panel, /tableDraftFromSchema/);

  // No raw DDL string construction or SQL escaping leaks into the component.
  assert.doesNotMatch(panel, /CREATE TABLE /);
  assert.doesNotMatch(panel, /ALTER TABLE /);
  assert.doesNotMatch(panel, /replace\(\/'\/g/);

  // Key designer controls are present.
  assert.match(panel, /添加列/);
  assert.match(panel, /复制 DDL/);
  assert.match(panel, /onApplyDdl/);

  // The model owns the generation surface.
  assert.match(model, /export function buildCreateTableDdl/);
  assert.match(model, /export function diffTableDraft/);
});
