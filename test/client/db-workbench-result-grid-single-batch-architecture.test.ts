import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("result grid single batch delegates volatile runtime behavior to a hook", async () => {
  const singleBatch = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  );
  const runtime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-runtime.ts",
  );
  const copyRuntime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-copy-runtime.ts",
  );
  const editRuntime = await read(
    "client/src/components/extensions/db-workbench/result-grid-single-batch-edit-runtime.ts",
  );

  assert.match(singleBatch, /useResultGridSingleBatchRuntime/);
  assert.match(singleBatch, /<ResultGridToolbar/);
  assert.match(singleBatch, /<ResultGridColumnHeader/);
  assert.match(singleBatch, /<ResultGridBody/);
  assert.match(singleBatch, /<SelectedRowInspector/);

  assert.doesNotMatch(singleBatch, /ResizeObserver/);
  assert.doesNotMatch(singleBatch, /writeClipboardText/);
  assert.doesNotMatch(singleBatch, /buildGridEditCommitPlan/);
  assert.doesNotMatch(singleBatch, /buildResultGridRowViews/);
  assert.doesNotMatch(singleBatch, /filterResultGridRows/);

  assert.match(runtime, /ResizeObserver/);
  assert.match(runtime, /buildResultGridRowViews/);
  assert.match(runtime, /filterResultGridRows/);
  assert.match(runtime, /useResultGridSingleBatchCopyActions/);
  assert.match(runtime, /useResultGridSingleBatchEditActions/);
  assert.doesNotMatch(runtime, /writeClipboardText/);
  assert.doesNotMatch(runtime, /buildGridEditCommitPlan/);

  assert.match(copyRuntime, /writeClipboardText/);
  assert.match(copyRuntime, /buildSelectedRowJson/);
  assert.match(copyRuntime, /buildSelectedRowTsv/);
  assert.match(editRuntime, /buildGridEditCommitPlan/);
  assert.match(editRuntime, /handleStageDeleteSelectedRow/);
});
