import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutPath = "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts";
const hookPath =
  "client/src/components/extensions/db-workbench/use-workbench-result-window-cap-notices.ts";
const layoutInputHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-state-action-input.ts";
const layoutRuntimeHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-runtime-controllers.ts";
const layoutWorkspaceStateHookPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-workspace-state.ts";
const controllerGraphPath =
  "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts";

test("result window cap notice memory is owned outside the layout shell", () => {
  const layoutSource = readFileSync(layoutPath, "utf8");
  const hookSource = readFileSync(hookPath, "utf8");
  const layoutInputHookSource = readFileSync(layoutInputHookPath, "utf8");
  const layoutRuntimeHookSource = readFileSync(layoutRuntimeHookPath, "utf8");
  const layoutWorkspaceStateHookSource = readFileSync(
    layoutWorkspaceStateHookPath,
    "utf8",
  );
  const controllerGraphSource = readFileSync(controllerGraphPath, "utf8");

  assert.match(layoutSource, /useWorkbenchLayoutWorkspaceState\(\{ connection \}\)/);
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(layoutWorkspaceStateHookSource, /useWorkbenchResultWindowCapNotices\(\)/);
  assert.match(controllerGraphSource, /resultWindowCapNotices,/);
  assert.match(layoutInputHookSource, /resultWindowCapNotices\.clearShownWindowCapNotices/);
  assert.match(layoutRuntimeHookSource, /resultWindowCapNotices\.hasShownWindowCapNotice/);
  assert.match(layoutRuntimeHookSource, /resultWindowCapNotices\.markWindowCapNoticeShown/);
  assert.doesNotMatch(layoutSource, /trimmedBatchAlertsRef/);

  assert.match(hookSource, /useRef<Set<number>>\(new Set\(\)\)/);
  assert.match(hookSource, /shownBatchIndexesRef\.current\.clear\(\)/);
  assert.match(hookSource, /shownBatchIndexesRef\.current\.has\(batchIndex\)/);
  assert.match(hookSource, /shownBatchIndexesRef\.current\.add\(batchIndex\)/);
});
