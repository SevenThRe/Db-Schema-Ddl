import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("background job contracts and runtime wiring exist for recent persisted jobs", async () => {
  const sharedSchema = await read("shared/schema.ts");
  const hostApi = await read("client/src/extensions/host-api.ts");
  const bridge = await read("client/src/lib/desktop-bridge.ts");
  const modRs = await read("src-tauri/src/db_connector/mod.rs");
  const commands = await read("src-tauri/src/db_connector/commands.rs");
  const libRs = await read("src-tauri/src/lib.rs");

  assert.match(sharedSchema, /export type DbBackgroundJobKind = "data-apply";/);
  assert.match(sharedSchema, /export interface DbBackgroundJobSummary \{/);
  assert.match(sharedSchema, /export interface DbBackgroundJobListRequest \{/);
  assert.match(sharedSchema, /export interface DbBackgroundJobListResponse \{/);
  assert.match(hostApi, /listBackgroundJobs\(request: DbBackgroundJobListRequest\): Promise<DbBackgroundJobListResponse>;/);
  assert.match(bridge, /async listBackgroundJobs\(/);
  assert.match(bridge, /invoke<DbBackgroundJobListResponse>\("db_background_job_list"/);
  assert.match(modRs, /pub enum DbBackgroundJobKind \{/);
  assert.match(modRs, /pub struct DbBackgroundJobSummary \{/);
  assert.match(commands, /pub async fn db_background_job_list\(/);
  assert.match(libRs, /db_connector::commands::db_background_job_list,/);
});

test("storage and data-apply runtime expose recent history rather than detail-only review", async () => {
  const storage = await read("src-tauri/src/storage.rs");
  const dataApply = await read("src-tauri/src/db_connector/data_apply.rs");

  assert.match(storage, /pub fn list_db_data_apply_jobs\(/);
  assert.match(storage, /ORDER BY\s+COALESCE\(started_at, created_at\) DESC,/);
  assert.match(dataApply, /fn build_background_job_summary\(/);
  assert.match(dataApply, /DbBackgroundJobKind::DataApply/);
  assert.match(dataApply, /pub async fn db_background_job_list\(/);
});
