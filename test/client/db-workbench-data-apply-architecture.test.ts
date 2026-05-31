import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("data apply runner separates async backend operations from pure UI state actions", async () => {
  const runner = await read(
    "client/src/components/extensions/db-workbench/data-apply-runner.ts",
  );
  const stateActions = await read(
    "client/src/components/extensions/db-workbench/data-apply-state-actions.ts",
  );

  // The runner owns the async, backend-calling operations.
  assert.match(runner, /export async function runDataApplyPreview/);
  assert.match(runner, /export async function runDataApplyExecute/);
  assert.match(runner, /export function startDataApplyJobPolling/);
  // ...and re-exports the state actions so consumers keep one import surface.
  assert.match(runner, /from "\.\/data-apply-state-actions"/);
  // The pure state reducers no longer live in the runner.
  assert.doesNotMatch(runner, /export function createDataApplyStateActions/);
  assert.doesNotMatch(runner, /export function runBeginDataApplyExecuteState/);

  // The state-actions module owns the pure execute/detail state transitions and
  // must not reach into the async backend operations.
  assert.match(stateActions, /export function createDataApplyStateActions/);
  assert.match(stateActions, /export function runBeginDataApplyExecuteState/);
  assert.match(stateActions, /export function runApplyDataApplyJobDetailState/);
  assert.match(stateActions, /export interface DataApplyStateActions/);
  assert.doesNotMatch(stateActions, /executeDataApply|fetchDataApplyJobDetail|setTimeout/);
});
