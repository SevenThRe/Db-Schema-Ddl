import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench tracks inserted row drafts and includes them in prepare/commit review", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(
    workbench,
    /const \[pendingInsertedRows, setPendingInsertedRows\] = useState<Record<string, DbGridInsertedRowDraft>>\(\{\}\);/,
  );
  assert.match(workbench, /const insertedRows = uniqueBy\(/);
  assert.match(workbench, /insertedRows,/);
  assert.match(workbench, /pendingInsertedRows=\{pendingInsertedRows\}/);
  assert.match(workbench, /pendingInsertedRows=\{pendingInsertedRowSummaries\}/);
  assert.match(workbench, /prepared\.insertedRows/);
  assert.match(workbench, /result\.insertedRows/);
});

test("result grid exposes add-row drafting affordances for insert review", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(resultGrid, /Add row draft/);
  assert.match(resultGrid, /Draft inserts highlighted/);
  assert.match(resultGrid, /Omitted from INSERT\. Database default will apply\./);
  assert.match(resultGrid, /Discard draft/);
  assert.match(resultGrid, /parseInsertedValue/);
});

test("grid edit commit dialog renders pending insert summaries", async () => {
  const dialog = await read(
    "client/src/components/extensions/db-workbench/GridEditCommitDialog.tsx",
  );

  assert.match(dialog, /Pending Row Inserts/);
  assert.match(dialog, /Inserts: \{insertedRows\}/);
});
