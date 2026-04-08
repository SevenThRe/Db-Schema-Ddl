import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("prepare commit routes pending patch payload through prepareGridCommit", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /hostApi\.connections\.prepareGridCommit\(\{/);
  assert.match(workbench, /patchCells,/);
  assert.match(workbench, /primaryKeyColumns,/);
});

test("prepared preview must be explicitly confirmed before commitGridEdits", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /GridEditCommitDialog/);
  assert.match(workbench, /open={preparedGridPlan !== null}/);
  assert.match(workbench, /onConfirm={handleCommitGridEdits}/);
  assert.match(workbench, /hostApi\.connections\.commitGridEdits\(\{/);
});

test("discard path clears local patches and does not call commit api", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const discardBlock =
    workbench.match(/const handleDiscardGridEdits = useCallback\(\(\) => {[\s\S]*?}, \[\]\);/)?.[0] ??
    "";

  assert.ok(discardBlock.length > 0, "Expected handleDiscardGridEdits block");
  assert.match(discardBlock, /setPendingEditCells\(\{\}\);/);
  assert.match(discardBlock, /setPreparedGridPlan\(null\);/);
  assert.equal(/commitGridEdits/.test(discardBlock), false);
});

test("successful commit path refreshes active table query and keeps discard action visible", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(workbench, /await handleRunStarterQuery\(selectedTableName, "select"\);/);
  assert.match(resultGrid, /Discard edits/);
});
