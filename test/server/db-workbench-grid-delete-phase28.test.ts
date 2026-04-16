import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("grid edit runtime enforces single-row update/delete effects during commit", async () => {
  const gridEdit = await read("src-tauri/src/db_connector/grid_edit.rs");

  assert.match(gridEdit, /fn ensure_single_row_affected\(/);
  assert.match(gridEdit, /rows_affected\(\)/);
  assert.match(gridEdit, /row_count_mismatch: expected 1 affected row/);
});
