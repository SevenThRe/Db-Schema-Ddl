import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench live verification effects own session startup outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const liveEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-live-verification-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );

  assert.match(layout, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchLiveVerificationEffects\(\{/);
  assert.doesNotMatch(layout, /startWorkbenchLiveVerificationSession\(\{/);
  assert.doesNotMatch(layout, /emitLiveVerificationFlow/);
  assert.doesNotMatch(layout, /emitLiveVerificationCompleted/);

  assert.match(liveEffects, /startWorkbenchLiveVerificationSession\(\{/);
  assert.match(liveEffects, /emitFlowCheckpoint: emitLiveVerificationFlow/);
  assert.match(liveEffects, /emitCompletedCheckpoint: emitLiveVerificationCompleted/);
  assert.match(liveEffects, /runKeyStore/);
  assert.match(liveEffects, /schemaErrorMessage/);
});
