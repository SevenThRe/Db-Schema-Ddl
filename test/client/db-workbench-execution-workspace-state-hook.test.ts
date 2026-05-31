import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutPath = "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts";
const hookPath =
  "client/src/components/extensions/db-workbench/use-workbench-execution-workspace-state.ts";
const layoutHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts";

test("query execution workspace state is owned outside the layout shell", () => {
  const layoutSource = readFileSync(layoutPath, "utf8");
  const hookSource = readFileSync(hookPath, "utf8");
  const layoutHookSource = readFileSync(layoutHookPath, "utf8");

  assert.match(layoutSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(
    layoutHookSource,
    /useWorkbenchExecutionWorkspaceState\(\s*initialSession\.lastResultTab,\s*\)/,
  );
  assert.doesNotMatch(layoutSource, /const \[currentRequestId, setCurrentRequestId\]/);
  assert.doesNotMatch(layoutSource, /const \[dangerPreview, setDangerPreview\]/);
  assert.doesNotMatch(layoutSource, /const \[pendingParameterReview, setPendingParameterReview\]/);
  assert.doesNotMatch(layoutSource, /const \[resultTab, setResultTab\]/);

  assert.match(hookSource, /const \[currentRequestId, setCurrentRequestId\]/);
  assert.match(hookSource, /const \[dangerPreview, setDangerPreview\]/);
  assert.match(hookSource, /const \[pendingParameterReview, setPendingParameterReview\]/);
  assert.match(hookSource, /useState<WorkbenchResultTab>\(initialResultTab\)/);
});
