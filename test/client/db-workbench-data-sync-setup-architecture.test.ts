import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("data sync setup panel delegates route connection and table config rendering", async () => {
  const panel = await read(
    "client/src/components/extensions/db-workbench/WorkbenchDataSyncSetupPanel.tsx",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/workbench-data-sync-setup-sections.tsx",
  );

  assert.match(panel, /<DataSyncRouteSummary/);
  assert.match(panel, /<DataSyncConnectionSelectorBar/);
  assert.match(panel, /<DataSyncTablePicker/);
  assert.match(panel, /<DataSyncSelectedTableConfigs/);
  assert.doesNotMatch(panel, /Compare source -> target/);
  assert.doesNotMatch(panel, /Key columns override/);
  assert.doesNotMatch(panel, /No stable key was detected/);

  assert.match(sections, /Compare source -> target/);
  assert.match(sections, /Source connection/);
  assert.match(sections, /Target connection/);
  assert.match(sections, /Key columns override/);
  assert.match(sections, /Compare columns override/);
  assert.match(sections, /Row filter/);
  assert.match(sections, /No stable key was detected/);
});
