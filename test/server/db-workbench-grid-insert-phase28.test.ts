import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("grid edit runtime supports insert mutation plans alongside update/delete", async () => {
  const gridEdit = await read("src-tauri/src/db_connector/grid_edit.rs");

  assert.match(gridEdit, /DbGridInsertedRowDraft/);
  assert.match(gridEdit, /PreparedMutationKind::Insert/);
  assert.match(gridEdit, /fn normalize_insert_rows\(/);
  assert.match(gridEdit, /fn build_insert_sql\(/);
  assert.match(gridEdit, /INSERT INTO/);
  assert.match(gridEdit, /inserted_rows:/);
});
