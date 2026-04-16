import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  detectSqlParameters,
  renderSqlParameters,
} from "../../client/src/components/extensions/db-workbench/sql-parameters.ts";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("detects :name and {{name}} placeholders while ignoring strings, comments, and ::casts", () => {
  const sql = `
    -- :ignored
    SELECT *
    FROM users
    WHERE id = :user_id
      AND created_at::date = {{target_date}}
      AND note = ':still_ignored'
      AND body <> 'hello {{ignored}}'
      /* {{ignored_block}} */
  `;

  const parameters = detectSqlParameters(sql);
  assert.deepEqual(
    parameters.map((parameter) => parameter.name),
    ["user_id", "target_date"],
  );
});

test("renders SQL literals, raw expressions, and preserves the targeted cursor statement offset", () => {
  const sql = "SELECT * FROM users WHERE id = :user_id;\nDELETE FROM users WHERE created_at < {{cutoff}};";
  const originalCursor = sql.indexOf("DELETE");
  const rendered = renderSqlParameters(
    sql,
    {
      user_id: { rawValue: "42" },
      cutoff: { rawValue: "=NOW() - INTERVAL '30 days'" },
    },
    originalCursor,
  );

  assert.match(rendered.sql, /id = 42/);
  assert.match(rendered.sql, /created_at < NOW\(\) - INTERVAL '30 days'/);
  assert.equal(typeof rendered.cursorOffset, "number");
  assert.ok((rendered.cursorOffset ?? 0) >= rendered.sql.indexOf("DELETE"));
});

test("workbench execution path pauses for parameter review and resumes through the dialog", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /detectSqlParameters\(sql\)/);
  assert.match(workbench, /setPendingParameterReview\(/);
  assert.match(workbench, /<SqlParametersDialog/);
  assert.match(workbench, /await previewAndExecuteSql\(/);
});
