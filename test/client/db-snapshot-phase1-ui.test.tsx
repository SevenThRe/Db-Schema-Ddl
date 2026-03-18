import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db management hooks expose snapshot compare and report export seams", async () => {
  const hooks = await read("client/src/hooks/use-db-management.ts");
  const routes = await read("shared/routes.ts");

  assert.match(hooks, /DB_MANAGEMENT_VIEW_MODES/);
  assert.match(hooks, /"snapshot-compare"/);
  assert.match(hooks, /usePreviewDbSnapshotCompare/);
  assert.match(hooks, /useExportDbSnapshotCompareReport/);

  assert.match(routes, /snapshotCompare:/);
  assert.match(routes, /exportSnapshotCompareReport:/);
});

test("db management workspace wires a dedicated Snapshot Compare main view", async () => {
  const workspace = await read("client/src/components/db-management/DbManagementWorkspace.tsx");

  assert.match(workspace, /DbSnapshotCompareWorkspace/);
  assert.match(workspace, /TabsTrigger value="snapshot-compare"/);
  assert.match(workspace, /TabsContent value="snapshot-compare"/);
  assert.match(workspace, /setActiveView\("snapshot-compare"\)/);
});

test("snapshot compare workspace has dual-source selectors, freshness controls, and report export actions", async () => {
  const workspace = await read("client/src/components/db-management/DbSnapshotCompareWorkspace.tsx");

  assert.match(workspace, /Snapshot Compare/);
  assert.match(workspace, /left/);
  assert.match(workspace, /right/);
  assert.match(workspace, /使用最近 snapshot/);
  assert.match(workspace, /比较前刷新 live/);
  assert.match(workspace, /导出 Markdown/);
  assert.match(workspace, /导出 JSON/);
  assert.match(workspace, /task-friendly JSON/);
});

test("history panel is kept timeline-detail focused and hands off to Snapshot Compare", async () => {
  const historyPanel = await read("client/src/components/db-management/DbHistoryPanel.tsx");

  assert.match(historyPanel, /这里只保留单库时间线和版本详情/);
  assert.match(historyPanel, /在 Snapshot Compare 打开/);
  assert.match(historyPanel, /当前 snapshot vs 上一个 snapshot/);
  assert.doesNotMatch(historyPanel, /当前 live vs 上一个 snapshot/);
  assert.doesNotMatch(historyPanel, /Select value=\{preset\}/);
});
