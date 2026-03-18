import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("DB management client seam exposes a dedicated db-vs-db main view", async () => {
  const hooks = await read("client/src/hooks/use-db-management.ts");
  const workspace = await read("client/src/components/db-management/DbManagementWorkspace.tsx");

  assert.match(hooks, /DB_MANAGEMENT_VIEW_MODES/);
  assert.match(hooks, /"db-vs-db"/);
  assert.match(hooks, /DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY/);
  assert.match(workspace, /DbVsDbWorkspace/);
  assert.match(workspace, /TabsTrigger value="db-vs-db"/);
});

test("DB management hooks expose DB-vs-DB compare, preview, graph, and compare-policy loaders", async () => {
  const hooks = await read("client/src/hooks/use-db-management.ts");
  const routes = await read("shared/routes.ts");

  assert.match(hooks, /usePreviewDbVsDbCompare/);
  assert.match(hooks, /useReviewDbVsDbRenames/);
  assert.match(hooks, /usePreviewDbVsDbSql/);
  assert.match(hooks, /useDbVsDbGraphData/);
  assert.match(hooks, /useDbComparePolicy/);
  assert.match(hooks, /useUpdateDbComparePolicy/);

  assert.match(routes, /compareDatabases:/);
  assert.match(routes, /reviewDatabaseRenames:/);
  assert.match(routes, /previewDatabaseSql:/);
  assert.match(routes, /databaseGraph:/);
});

test("dedicated DB-vs-DB workspace exposes source/target swap, directional preview, and graph linkage", async () => {
  const source = await read("client/src/components/db-management/DbVsDbWorkspace.tsx");

  assert.match(source, /source/);
  assert.match(source, /target/);
  assert.match(source, /swap-source-target/);
  assert.match(source, /Directional Preview/);
  assert.match(source, /Graph Linkage/);
  assert.match(source, /先整库比较，再筛选表/);
});

test("settings surface low-complexity DB compare policy thresholds", async () => {
  const settings = await read("client/src/pages/Settings.tsx");
  const policySection = await read("client/src/components/settings/DbComparePolicySection.tsx");

  assert.match(settings, /DbComparePolicySection/);
  assert.match(policySection, /Table rename auto-accept threshold/);
  assert.match(policySection, /Column rename auto-accept threshold/);
  assert.match(policySection, /默认全部人工确认/);
});
