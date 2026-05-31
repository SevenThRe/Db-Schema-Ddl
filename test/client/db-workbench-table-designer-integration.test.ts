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
