import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("table designer is mounted into the workbench dialog stack", async () => {
  const stack = await read(
    "client/src/components/extensions/db-workbench/WorkbenchDialogStack.tsx",
  );
  const stackProps = await read(
    "client/src/components/extensions/db-workbench/workbench-dialog-stack-props.ts",
  );
  const dialog = await read(
    "client/src/components/extensions/db-workbench/TableDesignerDialog.tsx",
  );

  // The dialog is part of the rendered stack (optional seam for incremental wiring).
  assert.match(stack, /import \{ TableDesignerDialog \} from "\.\/TableDesignerDialog"/);
  assert.match(stack, /<TableDesignerDialog \{\.\.\.tableDesigner\} \/>/);
  assert.match(stack, /tableDesigner\?: TableDesignerDialogProps/);

  // The props builder forwards the optional designer props.
  assert.match(stackProps, /tableDesigner: input\.tableDesigner/);

  // The dialog hosts the panel and forwards the apply callback.
  assert.match(dialog, /import \{ TableDesignerPanel \} from "\.\/TableDesignerPanel"/);
  assert.match(dialog, /<TableDesignerPanel/);
  assert.match(dialog, /onApplyDdl=\{onApplyDdl\}/);
});

test("table designer is wired end-to-end from a toolbar trigger to the execution pipeline", async () => {
  const shellModel = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const layout = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const chrome = await read(
    "client/src/components/extensions/db-workbench/WorkbenchOperatorChrome.tsx",
  );

  // Shell model owns designer state, supplies the dialog wiring, and binds apply
  // to the real script-execution pipeline (dangerous-SQL confirmation included).
  assert.match(shellModel, /runApplyTableDesign/);
  assert.match(shellModel, /executeScript: queryControllers\.handleExecuteScript/);
  assert.match(shellModel, /notify: hostApi\.notifications\.show/);
  assert.match(shellModel, /refreshSchema: backendQueries\.refetchSchema/);
  assert.match(shellModel, /tableDesigner: \{/);
  assert.match(shellModel, /onOpenTableDesigner: openTableDesignerForNewTable/);

  // Layout exposes the trigger into the operator chrome.
  assert.match(layout, /onOpenTableDesigner=\{onOpenTableDesigner\}/);

  // The chrome renders a reachable "new table" trigger when supplied.
  assert.match(chrome, /onOpenTableDesigner\?: \(\) => void/);
  assert.match(chrome, /新建表/);
});

test("table designer apply orchestration delegates to the pure policy + runner", async () => {
  const runner = await read(
    "client/src/components/extensions/db-workbench/table-designer-runner.ts",
  );

  assert.match(runner, /import \{ planTableDesignApply \} from "\.\/table-designer-apply"/);
  assert.match(runner, /export function createTableDesignerStateActions/);
  assert.match(runner, /export async function runApplyTableDesign/);
  // Apply must run through the injected executor (the existing query pipeline),
  // never build its own execution.
  assert.match(runner, /input\.executeScript\(plan\.script\)/);
  assert.doesNotMatch(runner, /executeQuery|invoke\(/);
});
