import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutPath = "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts";
const hookPath =
  "client/src/components/extensions/db-workbench/use-workbench-result-workspace-state.ts";
const layoutHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts";

test("result batch export and job-center state is owned outside the layout shell", () => {
  const layoutSource = readFileSync(layoutPath, "utf8");
  const hookSource = readFileSync(hookPath, "utf8");
  const layoutHookSource = readFileSync(layoutHookPath, "utf8");

  assert.match(layoutSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(
    layoutHookSource,
    /useWorkbenchResultWorkspaceState\(\s*initialSession\.selectedJobId,\s*\)/,
  );
  assert.doesNotMatch(layoutSource, /const \[backgroundJobs, setBackgroundJobs\]/);
  assert.doesNotMatch(layoutSource, /const \[currentExportRequestId, setCurrentExportRequestId\]/);
  assert.doesNotMatch(layoutSource, /const \[activeBatchIndex, setActiveBatchIndex\]/);

  assert.match(hookSource, /const \[backgroundJobs, setBackgroundJobs\]/);
  assert.match(hookSource, /const \[selectedJobId, setSelectedJobId\]/);
  assert.match(hookSource, /const \[currentExportRequestId, setCurrentExportRequestId\]/);
});
