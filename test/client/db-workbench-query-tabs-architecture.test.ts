import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("query tab UI delegates persistence and migration to storage runtime", async () => {
  const queryTabs = await read(
    "client/src/components/extensions/db-workbench/QueryTabs.tsx",
  );
  const storage = await read(
    "client/src/components/extensions/db-workbench/query-tabs-storage.ts",
  );
  const hydration = await read(
    "client/src/components/extensions/db-workbench/workbench-session-hydration.ts",
  );
  const tabRuntime = await read(
    "client/src/components/extensions/db-workbench/workbench-tab-runtime.ts",
  );

  assert.match(queryTabs, /from "\.\/query-tabs-storage"/);
  assert.doesNotMatch(queryTabs, /from "\.\/workbench-session"/);
  assert.doesNotMatch(queryTabs, /window\.localStorage/);
  assert.doesNotMatch(queryTabs, /parseTabsFromJson/);
  assert.match(storage, /loadSessionForConnection/);
  assert.match(storage, /saveSessionForConnection/);
  assert.match(storage, /window\.localStorage/);
  assert.match(storage, /parseTabsFromJson/);
  assert.match(hydration, /from "\.\/query-tabs-storage"/);
  assert.match(tabRuntime, /from "\.\/query-tabs-storage"/);
});
