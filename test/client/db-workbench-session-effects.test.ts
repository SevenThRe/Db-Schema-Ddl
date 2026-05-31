import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench session effects own restore, selection repair, and persistence outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const sessionEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-session-effects.ts",
  );
  const layoutSessionEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-session-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );

  assert.match(layout, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchLayoutSessionEffects\(\{/);
  assert.doesNotMatch(layout, /useWorkbenchSessionEffects\(\{/);
  assert.doesNotMatch(layout, /runWorkbenchConnectionRestore/);
  assert.doesNotMatch(layout, /runResolveSqlLibrarySelection/);
  assert.doesNotMatch(layout, /runRepairActiveQueryTabSelection/);
  assert.doesNotMatch(layout, /runPersistWorkbenchSession/);

  assert.match(layoutSessionEffects, /useWorkbenchSessionEffects\(\{/);
  assert.match(layoutSessionEffects, /saveSession: saveSessionForConnection/);
  assert.match(sessionEffects, /runWorkbenchConnectionRestore\(\{/);
  assert.match(sessionEffects, /runResolveSqlLibrarySelection\(\{/);
  assert.match(sessionEffects, /runRepairActiveQueryTabSelection\(\{/);
  assert.match(sessionEffects, /runPersistWorkbenchSession\(\{/);
  assert.match(sessionEffects, /saveSession,/);
  assert.match(sessionEffects, /schemaDiffTargetConnectionId/);
  assert.match(sessionEffects, /syncSourceConnectionId/);
  assert.match(sessionEffects, /selectedJobId/);
});
