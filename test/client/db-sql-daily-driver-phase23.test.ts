import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql daily-driver copy keeps library, review, and session cues in one coherent path", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const operatorChrome = await read(
    "client/src/components/extensions/db-workbench/WorkbenchOperatorChrome.tsx",
  );
  const workspaceBodyProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-workspace-body-props.ts",
  );
  const editor = await read(
    "client/src/components/extensions/db-workbench/SqlEditorPane.tsx",
  );
  const editorToolbar = await read(
    "client/src/components/extensions/db-workbench/sql-editor-toolbar.tsx",
  );
  const library = await read(
    "client/src/components/extensions/db-workbench/SqlLibraryDialog.tsx",
  );
  const scriptReview = await read(
    "client/src/components/extensions/db-workbench/SqlScriptReviewDialog.tsx",
  );
  const parameterReview = await read(
    "client/src/components/extensions/db-workbench/SqlParametersDialog.tsx",
  );
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const resultGridChrome = await read(
    "client/src/components/extensions/db-workbench/result-grid-pane-chrome.tsx",
  );
  const design = await read("docs/db-workbench-extension-design.md");

  assert.match(workbench, /<WorkbenchWorkspaceBody \{\.\.\.workspaceBodyProps\} \/>/);
  assert.match(workspaceBodyProps, /queryHistoryCount: input\.queryHistory\.length/);
  assert.match(operatorChrome, /connection-scoped tabs,\s*drafts, history, snippets,/);
  assert.match(operatorChrome, /SQL memory, and local copilot prompt grounding/);
  assert.match(editor, /<SqlEditorToolbar/);
  assert.match(editorToolbar, /Run statement/);
  assert.match(editorToolbar, /Run script \(Shift\+Ctrl\+Enter\) and continue through the execution-review path/);
  assert.match(editorToolbar, /Stop active query or export/);
  assert.match(library, /connection-scoped workspace/);
  assert.match(library, /opening a new tab in this connection session/);
  assert.match(scriptReview, /standardized execution-review path/);
  assert.match(scriptReview, /dangerous-SQL review/);
  assert.match(parameterReview, /current\s+connection session/);
  assert.match(
    parameterReview,
    /dangerous-SQL confirmation and\s+execution flow for the active connection/,
  );
  assert.match(resultGrid, /<ResultGridEmptyState/);
  assert.match(resultGridChrome, /connection-scoped session/);
  assert.match(design, /tabs、drafts、history、snippets 是连接级会话资产/);
  assert.match(design, /script review、parameter review、dangerous SQL review 属于统一执行复核路径/);
});
