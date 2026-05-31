import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutPath = "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts";
const hookPath =
  "client/src/components/extensions/db-workbench/use-workbench-operator-workspace-state.ts";
const layoutHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts";

test("operator inspection grid schema and request refs are owned outside the layout shell", () => {
  const layoutSource = readFileSync(layoutPath, "utf8");
  const hookSource = readFileSync(hookPath, "utf8");
  const layoutHookSource = readFileSync(layoutHookPath, "utf8");

  assert.match(layoutSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutHookSource, /useWorkbenchOperatorWorkspaceState\(\{/);
  assert.doesNotMatch(layoutSource, /const \[pendingEditCells, setPendingEditCells\]/);
  assert.doesNotMatch(layoutSource, /const \[activeSchema, setActiveSchema\]/);
  assert.doesNotMatch(layoutSource, /const activeQueryRequestIdRef = useRef/);
  assert.doesNotMatch(layoutSource, /createEmptyObjectInspectionState/);
  assert.doesNotMatch(layoutSource, /resolveRestoredActiveSchema/);

  assert.match(hookSource, /const \[pendingEditCells, setPendingEditCells\]/);
  assert.match(hookSource, /const \[activeSchema, setActiveSchema\]/);
  assert.match(hookSource, /const activeQueryRequestIdRef = useRef<string \| null>\(null\)/);
  assert.match(hookSource, /createEmptyObjectInspectionState/);
  assert.match(hookSource, /resolveRestoredActiveSchema/);
});
