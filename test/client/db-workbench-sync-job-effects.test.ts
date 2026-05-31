import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench sync job effects own background refresh detail load and polling outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const syncJobEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-sync-job-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );

  assert.match(layout, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchSyncJobEffects\(\{/);
  assert.doesNotMatch(layout, /void refreshBackgroundJobs\(\)/);
  assert.doesNotMatch(layout, /handleLoadSelectedJobDetail\(\)/);
  assert.doesNotMatch(layout, /startApplyJobPolling\(\)/);

  assert.match(syncJobEffects, /refreshBackgroundJobs\(\)/);
  assert.match(syncJobEffects, /handleLoadSelectedJobDetail\(\)/);
  assert.match(syncJobEffects, /startApplyJobPolling\(\)/);
  assert.match(syncJobEffects, /connectionId/);
});
