import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutPath = "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts";
const hookPath =
  "client/src/components/extensions/db-workbench/use-workbench-sql-workspace-state.ts";
const layoutHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts";

test("sql workspace session and copilot state is owned outside the layout shell", () => {
  const layoutSource = readFileSync(layoutPath, "utf8");
  const hookSource = readFileSync(hookPath, "utf8");
  const layoutHookSource = readFileSync(layoutHookPath, "utf8");

  assert.match(layoutSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutHookSource, /useWorkbenchSqlWorkspaceState\(initialSession\)/);
  assert.doesNotMatch(layoutSource, /const \[tabs, setTabs\]/);
  assert.doesNotMatch(layoutSource, /const \[sqlMemory, setSqlMemory\]/);
  assert.doesNotMatch(layoutSource, /const \[sqlCopilotProbeResult, setSqlCopilotProbeResult\]/);
  assert.doesNotMatch(layoutSource, /pickSqlCopilotSettings\(createDefaultDdlSettings\(\)\)/);

  assert.match(hookSource, /const \[tabs, setTabs\]/);
  assert.match(hookSource, /const \[sqlMemory, setSqlMemory\]/);
  assert.match(hookSource, /const \[sqlCopilotProbeResult, setSqlCopilotProbeResult\]/);
  assert.match(hookSource, /pickSqlCopilotSettings\(createDefaultDdlSettings\(\)\)/);
});
