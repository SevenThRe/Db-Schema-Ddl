import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("query execution runner separates the async run loop from the state-action factory", async () => {
  const runner = await read(
    "client/src/components/extensions/db-workbench/query-execution-runner.ts",
  );
  const stateActions = await read(
    "client/src/components/extensions/db-workbench/query-execution-state-actions.ts",
  );

  // The runner owns the async execute loop + failure notice and re-exports the
  // state-action factory so consumers keep one import surface.
  assert.match(runner, /export async function runWorkbenchQueryExecution/);
  assert.match(runner, /export function buildQueryExecutionFailureNotice/);
  assert.match(runner, /from "\.\/query-execution-state-actions"/);
  assert.doesNotMatch(runner, /export function createQueryExecutionStateActions/);
  assert.doesNotMatch(runner, /input\.setRecentQueries\(session\.recentQueries\)/);

  // The state-actions module owns the request lifecycle reducers and the
  // session-update fan-out (recent queries / history / memory).
  assert.match(stateActions, /export function createQueryExecutionStateActions/);
  assert.match(stateActions, /export function runStartQueryExecutionRequestState/);
  assert.match(stateActions, /input\.setRecentQueries\(session\.recentQueries\)/);
  assert.match(stateActions, /input\.setQueryHistory\(session\.queryHistory\)/);
  assert.match(stateActions, /input\.setSqlMemory\(session\.sqlMemory\)/);
});
