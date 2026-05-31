import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("explain plan pane delegates graph rendering and ELK layout to focused modules", async () => {
  const pane = await read(
    "client/src/components/extensions/db-workbench/ExplainPlanPane.tsx",
  );
  const runtime = await read(
    "client/src/components/extensions/db-workbench/explain-plan-runtime.ts",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/explain-plan-sections.tsx",
  );

  assert.match(pane, /flattenExplainPlanTree/);
  assert.match(pane, /computeExplainPlanLayout/);
  assert.match(pane, /<ExplainPlanToolbar/);
  assert.match(pane, /<ExplainPlanGraphView/);
  assert.match(pane, /<ExplainPlanRawJsonView/);
  assert.match(pane, /<ExplainPlanStatusState/);
  assert.doesNotMatch(pane, /new ELK/);
  assert.doesNotMatch(pane, /ReactFlow/);
  assert.doesNotMatch(pane, /FULL_TABLE_SCAN/);

  assert.match(runtime, /new ELK/);
  assert.match(runtime, /flattenExplainPlanTree/);
  assert.match(runtime, /computeExplainPlanLayout/);
  assert.match(runtime, /elk\.direction": "RIGHT"/);

  assert.match(sections, /ReactFlow/);
  assert.match(sections, /FULL_TABLE_SCAN/);
  assert.match(sections, /LARGE_ROWS_ESTIMATE/);
  assert.match(sections, /FULL SCAN/);
  assert.match(sections, /LARGE ROWS/);
  assert.match(sections, /Copy JSON/);
  assert.match(sections, /@xyflow\/react\/dist\/style\.css/);
});
