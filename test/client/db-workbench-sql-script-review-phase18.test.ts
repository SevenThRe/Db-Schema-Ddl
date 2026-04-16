import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { splitSqlStatements } from "../../client/src/components/extensions/db-workbench/sql-statements.ts";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("client-side statement splitting ignores comments and quoted semicolons", () => {
  const sql = `
    -- comment ; ignored
    SELECT 'a;b';
    UPDATE users SET active = false WHERE id = 1;
    /* block ; ignored */
    SHOW TABLES;
  `;

  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 3);
  assert.equal(statements[0]?.kind, "select");
  assert.equal(statements[1]?.kind, "dml");
  assert.equal(statements[2]?.kind, "show");
  assert.match(statements[0]?.summary ?? "", /SELECT 'a;b'/);
});

test("workbench exposes script review flow before multi-statement execution", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const editor = await read(
    "client/src/components/extensions/db-workbench/SqlEditorPane.tsx",
  );

  assert.match(workbench, /splitSqlStatements\(sql\)/);
  assert.match(workbench, /setPendingScriptReview\(/);
  assert.match(workbench, /<SqlScriptReviewDialog/);
  assert.match(editor, /Run script/);
  assert.match(editor, /Run script \(Shift\+Ctrl\+Enter\)/);
});

test("result grid surfaces multi-statement script summary and failed-statement jump affordance", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(resultGrid, /Script summary/);
  assert.match(resultGrid, /Jump to failed statement/);
  assert.match(resultGrid, /All statements completed without statement-level failures/);
});
