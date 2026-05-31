import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutPath = "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts";
const hookPath =
  "client/src/components/extensions/db-workbench/use-workbench-sync-workspace-state.ts";
const layoutHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts";

test("schema diff and data sync state is owned outside the layout shell", () => {
  const layoutSource = readFileSync(layoutPath, "utf8");
  const hookSource = readFileSync(hookPath, "utf8");
  const layoutHookSource = readFileSync(layoutHookPath, "utf8");

  assert.match(layoutSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutHookSource, /useWorkbenchSyncWorkspaceState\(connection\.id\)/);
  assert.doesNotMatch(layoutSource, /const \[schemaDiffTargetConnectionId, setSchemaDiffTargetConnectionId\]/);
  assert.doesNotMatch(layoutSource, /const \[syncSourceConnectionId, setSyncSourceConnectionId\]/);
  assert.doesNotMatch(layoutSource, /const \[diffPreview, setDiffPreview\]/);
  assert.doesNotMatch(layoutSource, /createEmptySchemaDiffState/);

  assert.match(hookSource, /const \[schemaDiffTargetConnectionId, setSchemaDiffTargetConnectionId\]/);
  assert.match(hookSource, /const \[syncSourceConnectionId, setSyncSourceConnectionId\]/);
  assert.match(hookSource, /const \[diffPreview, setDiffPreview\]/);
  assert.match(hookSource, /createEmptySchemaDiffState/);
});
