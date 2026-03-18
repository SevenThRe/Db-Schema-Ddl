import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db management client seam exposes history, apply, and graph modes with remembered active mode storage", async () => {
  const source = await read("client/src/hooks/use-db-management.ts");

  assert.match(source, /DB_MANAGEMENT_VIEW_MODES/);
  assert.match(source, /"history"/);
  assert.match(source, /"apply"/);
  assert.match(source, /"graph"/);
  assert.match(source, /DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY/);
});

test("db management hooks expose history, compare, apply, deploy job, and graph loaders", async () => {
  const source = await read("client/src/hooks/use-db-management.ts");
  const routes = await read("shared/routes.ts");

  assert.match(source, /useDbHistory/);
  assert.match(source, /useDbHistoryDetail/);
  assert.match(source, /useCompareDbHistory/);
  assert.match(source, /useApplyDbChanges/);
  assert.match(source, /useDbDeployJobDetail/);
  assert.match(source, /useDbGraphData/);

  assert.match(routes, /listHistory:/);
  assert.match(routes, /compareHistory:/);
  assert.match(routes, /applyChanges:/);
  assert.match(routes, /deployJobDetail:/);
  assert.match(routes, /graphData:/);
});

test("db management workspace wires diff, history, apply, and graph panels with remembered active view", async () => {
  const workspace = await read("client/src/components/db-management/DbManagementWorkspace.tsx");

  assert.match(workspace, /DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY/);
  assert.match(workspace, /DbDiffWorkspace/);
  assert.match(workspace, /DbHistoryPanel/);
  assert.match(workspace, /DbApplyPanel/);
  assert.match(workspace, /DbSchemaGraph/);
  assert.match(workspace, /TabsTrigger value="diff"/);
  assert.match(workspace, /TabsTrigger value="history"/);
  assert.match(workspace, /TabsTrigger value="apply"/);
  assert.match(workspace, /TabsTrigger value="graph"/);
});

test("phase 5 client panels expose history compare, safe apply, and graph controls", async () => {
  const history = await read("client/src/components/db-management/DbHistoryPanel.tsx");
  const apply = await read("client/src/components/db-management/DbApplyPanel.tsx");
  const graph = await read("client/src/components/db-management/DbSchemaGraph.tsx");

  assert.match(history, /当前 live vs 上一个 snapshot/);
  assert.match(history, /snapshot vs snapshot/);
  assert.match(apply, /执行选中的安全变更/);
  assert.match(apply, /该表当前不可执行/);
  assert.match(graph, /@xyflow\/react/);
  assert.match(graph, /elkjs/);
  assert.match(graph, /完整 database/);
  assert.match(graph, /变更表 \+ 邻接关系/);
});
