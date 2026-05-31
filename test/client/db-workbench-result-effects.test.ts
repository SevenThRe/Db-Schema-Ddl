import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench result effects own result cleanup and active batch repair outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const resultEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-result-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );

  assert.match(layout, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchResultEffects\(\{/);
  assert.doesNotMatch(layout, /runClearResultWindowCapNotices/);
  assert.doesNotMatch(layout, /runRepairActiveBatchIndex/);
  assert.doesNotMatch(layout, /runClearGridDraftsForResultContext/);

  assert.match(resultEffects, /runClearResultWindowCapNotices\(resultWorkspaceStateActions\)/);
  assert.match(resultEffects, /runRepairActiveBatchIndex\(\{/);
  assert.match(resultEffects, /setActiveBatchIndex: resultWorkspaceStateActions\.setActiveBatchIndex/);
  assert.match(resultEffects, /runClearGridDraftsForResultContext\(resultWorkspaceStateActions\)/);
  assert.match(resultEffects, /results\?\.requestId/);
});
