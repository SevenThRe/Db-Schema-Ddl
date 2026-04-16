import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench tracks staged delete rows and includes them in prepare/commit review", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /const \[pendingDeleteRows, setPendingDeleteRows\] = useState<Record<string, DbGridDeleteRowDraft>>\(\{\}\);/);
  assert.match(workbench, /const deletedRows = uniqueBy\(\s*Object\.values\(pendingDeleteRows\),/);
  assert.match(workbench, /deletedRows,/);
  assert.match(workbench, /pendingDeletedRows=\{pendingDeletedRows\}/);
  assert.match(workbench, /pendingDeleteRows=\{pendingDeleteRows\}/);
});

test("result grid exposes staged delete affordances and mixed pending-change summaries", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(resultGrid, /Stage delete/);
  assert.match(resultGrid, /Revert delete/);
  assert.match(resultGrid, /Pending row deletes/);
  assert.match(resultGrid, /Delete-staged rows highlighted/);
  assert.match(resultGrid, /disabled=\{!isEditEnabled \|\| pendingMutationCount === 0\}/);
});
