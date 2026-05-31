import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench inspection effects own reset and restore outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const inspectionEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-inspection-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );

  assert.match(layout, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchInspectionEffects\(\{/);
  assert.doesNotMatch(layout, /runResetObjectInspectionForContext/);
  assert.doesNotMatch(layout, /void handleRestoreInspectionTarget\(\)/);

  assert.match(inspectionEffects, /runResetObjectInspectionForContext\(objectInspectionStateActions\)/);
  assert.match(inspectionEffects, /void restoreInspectionTarget\(\)/);
  assert.match(inspectionEffects, /connectionId/);
  assert.match(inspectionEffects, /runtimeSchema/);
});
