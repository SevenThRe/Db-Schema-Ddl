import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("result grid edit controls are fail-closed and lock primary key columns", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(resultGrid, /const isEditEnabled = editEligibility\?\.eligible === true;/);
  assert.match(resultGrid, /Primary key column \(read-only\)/);
  assert.match(resultGrid, /Pending edits:/);
  assert.match(resultGrid, /disabled={!isEditEnabled \|\| pendingEditCount === 0}/);
});

test("count-mode starter results remain read-only for edits", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /Count rows/);
  assert.match(workbench, /Count rows results are read-only\. Run Select top 100 to edit rows\./);
});

test("no-op cell changes remove patch entries from pending edit state", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /if \(isCellValueEqual\(patch\.beforeValue, patch\.nextValue\)\) {/);
  assert.match(workbench, /delete next\[patchKey\];/);
  assert.match(workbench, /setPreparedGridPlan\(null\);/);
});
