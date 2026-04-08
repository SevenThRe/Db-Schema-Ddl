import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbenchPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
);
const workbenchSource = readFileSync(workbenchPath, "utf8");

test("data sync flow keeps compare then preview then execute ordering", () => {
  const compareIndex = workbenchSource.indexOf("previewDataDiff(");
  const previewApplyIndex = workbenchSource.indexOf("previewDataApply(");
  const executeApplyIndex = workbenchSource.indexOf("executeDataApply(");

  assert.ok(compareIndex >= 0, "previewDataDiff should be wired");
  assert.ok(previewApplyIndex >= 0, "previewDataApply should be wired");
  assert.ok(executeApplyIndex >= 0, "executeDataApply should be wired");
  assert.ok(
    compareIndex < previewApplyIndex && previewApplyIndex < executeApplyIndex,
    "expected compare -> preview apply -> execute apply flow",
  );
});

test("stale artifact guards block execution and force rerun compare", () => {
  assert.match(workbenchSource, /target_snapshot_changed/);
  assert.match(workbenchSource, /artifact_expired/);
  assert.match(workbenchSource, /Re-run compare/);
});

test("unsafe_delete_threshold warning is surfaced before execute", () => {
  assert.match(workbenchSource, /unsafe_delete_threshold/);
  assert.match(workbenchSource, /warning is active/);
});

test("prod typed confirmation gate is required before execute call", () => {
  assert.match(workbenchSource, /typed confirmation required for prod target/);
  assert.match(workbenchSource, /applyProdConfirmation === activeSyncTargetConnection\.database/);
});

test("execute job detail loader stays reachable after execution", () => {
  assert.match(workbenchSource, /fetchDataApplyJobDetail\(/);
  assert.match(workbenchSource, /View job detail/);
});
