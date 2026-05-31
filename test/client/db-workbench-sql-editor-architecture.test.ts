import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql editor delegates Monaco provider hover and marker wiring to runtime helpers", async () => {
  const editor = await read(
    "client/src/components/extensions/db-workbench/SqlEditorPane.tsx",
  );
  const paneRuntime = await read(
    "client/src/components/extensions/db-workbench/sql-editor-pane-runtime.ts",
  );
  const runtime = await read(
    "client/src/components/extensions/db-workbench/sql-editor-monaco-runtime.ts",
  );
  const toolbar = await read(
    "client/src/components/extensions/db-workbench/sql-editor-toolbar.tsx",
  );

  assert.match(editor, /<SqlEditorToolbar/);
  assert.match(editor, /useSqlEditorPaneRuntime/);
  assert.doesNotMatch(editor, /registerSqlEditorAutocompleteProvider/);
  assert.doesNotMatch(editor, /registerSqlEditorHoverProvider/);
  assert.doesNotMatch(editor, /registerSqlCompletionAcceptanceCommand/);
  assert.doesNotMatch(editor, /applySqlEditorValidationMarkers/);
  assert.match(paneRuntime, /registerSqlEditorAutocompleteProvider/);
  assert.match(paneRuntime, /registerSqlEditorHoverProvider/);
  assert.match(paneRuntime, /registerSqlCompletionAcceptanceCommand/);
  assert.match(paneRuntime, /applySqlEditorValidationMarkers/);
  assert.match(paneRuntime, /db-execute-selection/);
  assert.match(paneRuntime, /db-execute-script/);
  assert.match(paneRuntime, /db-format-sql/);
  assert.doesNotMatch(editor, /registerCompletionItemProvider\("sql"/);
  assert.doesNotMatch(editor, /registerHoverProvider\("sql"/);
  assert.doesNotMatch(editor, /setModelMarkers\(model, "db-workbench"/);
  assert.match(runtime, /registerCompletionItemProvider\("sql"/);
  assert.match(runtime, /registerHoverProvider\("sql"/);
  assert.match(runtime, /setModelMarkers\(model, "db-workbench"/);
  assert.match(toolbar, /Run statement/);
  assert.match(toolbar, /Run script/);
});
