import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db diff service includes compare blockers, rename review, and SQL preview helpers", async () => {
  const source = await read("server/lib/extensions/db-management/db-diff-service.ts");

  assert.match(source, /export async function previewDbDiff/);
  assert.match(source, /export async function confirmDbDiffRenames/);
  assert.match(source, /export async function previewDbSql/);
  assert.match(source, /export async function previewDbDryRun/);
  assert.match(source, /drop_table/);
  assert.match(source, /drop_column/);
  assert.match(source, /type_shrink/);
  assert.match(source, /rename_unconfirmed/);
  assert.match(source, /not_null_without_fill/);
});

test("db management routes expose diff preview, rename confirmation, SQL preview, and dry run", async () => {
  const source = await read("server/routes/db-management-routes.ts");

  assert.match(source, /api\.dbManagement\.diffPreview/);
  assert.match(source, /api\.dbManagement\.confirmRenames/);
  assert.match(source, /api\.dbManagement\.previewSql/);
  assert.match(source, /api\.dbManagement\.dryRun/);
  assert.match(source, /previewDbDiff/);
  assert.match(source, /confirmDbDiffRenames/);
  assert.match(source, /previewDbSql/);
  assert.match(source, /previewDbDryRun/);
});
