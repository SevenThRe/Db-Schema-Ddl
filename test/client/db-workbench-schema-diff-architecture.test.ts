import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("schema diff pane preserves exported viewer while delegating setup and viewer chrome", async () => {
  const pane = await read(
    "client/src/components/extensions/db-workbench/SchemaDiffPane.tsx",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/schema-diff-sections.tsx",
  );
  const compatibilityViews = await read(
    "client/src/components/extensions/db-workbench/WorkbenchCompatibilityViews.tsx",
  );
  const resultWorkspacePane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
  );

  assert.match(pane, /export function DbSchemaDiffViewer/);
  assert.match(pane, /<SchemaDiffViewerLayout/);
  assert.match(pane, /<SchemaDiffSetupView/);
  assert.doesNotMatch(pane, /Compare active schema against another saved connection/);
  assert.doesNotMatch(pane, /MonacoDdlDiff/);
  assert.doesNotMatch(pane, /StructuredDiffContent/);

  assert.match(sections, /Compare active schema against another saved connection/);
  assert.match(sections, /Schema compare failed/);
  assert.match(sections, /Target connection/);
  assert.match(sections, /Compare active/);
  assert.match(sections, /StructuredDiffContent/);
  assert.match(sections, /MonacoDdlDiff/);

  assert.match(compatibilityViews, /<DbSchemaDiffViewer/);
  assert.match(resultWorkspacePane, /<WorkbenchSchemaDiffPane \{\.\.\.schemaDiff\} \/>/);
});
