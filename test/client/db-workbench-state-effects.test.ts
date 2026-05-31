import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench state effects own schema and sync maintenance outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const stateEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-state-effects.ts",
  );
  const layoutStateEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-state-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );

  assert.match(layout, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchLayoutStateEffects\(\{/);
  assert.doesNotMatch(layout, /useWorkbenchStateEffects\(\{/);
  assert.doesNotMatch(layout, /runResolveSchemaDiffTarget/);
  assert.doesNotMatch(layout, /runResolveDataSyncConnections/);
  assert.doesNotMatch(layout, /runReconcileDataSyncTables/);
  assert.doesNotMatch(layout, /runClearDataSyncArtifacts/);
  assert.doesNotMatch(layout, /notifySchemaLoadFailure\(schemaErrorMessage\)/);

  assert.match(layoutStateEffects, /useWorkbenchStateEffects\(\{/);
  assert.match(layoutStateEffects, /connections: backendQueries\.connections/);
  assert.match(layoutStateEffects, /syncAvailableTableNames: syncSchemaContext\.availableTableNames/);
  assert.match(stateEffects, /runResolveSchemaDiffTarget\(\{/);
  assert.match(stateEffects, /runResolveDataSyncConnections\(\{/);
  assert.match(stateEffects, /schemaStateActions\.notifySchemaLoadFailure/);
  assert.match(stateEffects, /schemaStateActions\.notifySchemaOptionsFailure/);
  assert.match(stateEffects, /schemaStateActions\.applyDdlSettingsToSqlCopilotDraft/);
  assert.match(stateEffects, /schemaStateActions\.resolveSelectedTableForSchema/);
  assert.match(stateEffects, /runReconcileDataSyncTables\(\{/);
  assert.match(stateEffects, /runClearDataSyncArtifacts\(dataDiffStateActions\)/);
});
