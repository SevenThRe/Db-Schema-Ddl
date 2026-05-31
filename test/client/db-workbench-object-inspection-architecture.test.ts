import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("object inspection pane delegates detail rendering to focused sections", async () => {
  const pane = await read(
    "client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/object-inspection-sections.tsx",
  );

  assert.match(pane, /<ObjectInspectionLoadingState/);
  assert.match(pane, /<ObjectInspectionEmptyState/);
  assert.match(pane, /<ObjectInspectionHeader/);
  assert.match(pane, /<ObjectInspectionCoverageAlert/);
  assert.match(pane, /<ObjectInspectionDdlView/);
  assert.match(pane, /<ObjectInspectionMetadataView/);
  assert.doesNotMatch(pane, /Definition SQL/);
  assert.doesNotMatch(pane, /Foreign Keys/);
  assert.doesNotMatch(pane, /Inspect ref/);
  assert.match(sections, /Definition SQL/);
  assert.match(sections, /Foreign Keys/);
  assert.match(sections, /Inspect ref/);
  assert.match(sections, /defaultDdlText/);
});
