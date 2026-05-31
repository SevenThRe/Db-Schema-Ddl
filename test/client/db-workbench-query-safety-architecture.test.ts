import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("query safety runner separates safety-review flows from the state-action factory", async () => {
  const runner = await read(
    "client/src/components/extensions/db-workbench/query-safety-runner.ts",
  );
  const stateActions = await read(
    "client/src/components/extensions/db-workbench/query-safety-state-actions.ts",
  );

  // The runner owns the async safety-review flow operations and re-exports the
  // state-action factory so consumers keep one import surface.
  assert.match(runner, /export async function runPreviewAndExecuteSql/);
  assert.match(runner, /export async function runConfirmDangerousSql/);
  assert.match(runner, /export async function runExecuteScriptWithReview/);
  assert.match(runner, /from "\.\/query-safety-state-actions"/);
  assert.doesNotMatch(runner, /export function createQuerySafetyStateActions/);

  // The state-actions module owns the wiring factory and its contracts only;
  // it must not embed the async review flows.
  assert.match(stateActions, /export function createQuerySafetyStateActions/);
  assert.match(stateActions, /export interface QuerySafetyStateActions/);
  assert.match(stateActions, /export interface DangerousSqlReviewResetters/);
  assert.doesNotMatch(stateActions, /previewDangerousSql|previewAndExecuteSql|renderSqlParameters/);
});
