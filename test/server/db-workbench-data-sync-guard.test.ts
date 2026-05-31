import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("data sync backend rejects same source and target connections for compare and apply", async () => {
  const dataDiff = await read("src-tauri/src/db_connector/data_diff.rs");
  const dataApply = await read("src-tauri/src/db_connector/data_apply.rs");

  assert.match(dataDiff, /fn validate_distinct_connection_pair\(/);
  assert.match(
    dataDiff,
    /source and target connections must be different for data sync/,
  );
  assert.match(dataDiff, /validate_distinct_connection_pair\(\s*&request\.source_connection_id,/);

  assert.match(dataApply, /fn validate_distinct_connection_pair\(/);
  assert.match(
    dataApply,
    /source and target connections must be different for data sync/,
  );
  assert.match(
    dataApply,
    /validate_distinct_connection_pair\(\s*request_source_connection_id,\s*request_target_connection_id,/,
  );
});
