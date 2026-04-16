import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import type { DbSchemaSnapshot } from "../../shared/schema.ts";
import {
  buildAutocompleteContext,
  buildCompletionItems,
} from "../../client/src/components/extensions/db-workbench/sql-autocomplete.ts";
import {
  buildSqlLibraryEntries,
  filterSqlLibraryEntries,
} from "../../client/src/components/extensions/db-workbench/sql-library.ts";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

function createSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "conn-1",
    connectionName: "Local Postgres",
    database: "app",
    schema: "public",
    tables: [
      {
        name: "users",
        columns: [
          { name: "id", dataType: "uuid", nullable: false, primaryKey: true },
          { name: "email", dataType: "text", nullable: false, primaryKey: false },
        ],
      },
      {
        name: "orders",
        columns: [
          { name: "id", dataType: "uuid", nullable: false, primaryKey: true },
          { name: "user_id", dataType: "uuid", nullable: false, primaryKey: false },
        ],
      },
    ],
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

test("sql library entries unify snippets and recent queries with searchable previews", () => {
  const entries = buildSqlLibraryEntries(
    [
      {
        id: "snippet-1",
        name: "Cleanup users",
        sql: "DELETE FROM users WHERE deleted_at IS NOT NULL;",
        updatedAt: "2026-04-12T12:00:00.000Z",
      },
    ],
    ["SELECT * FROM orders ORDER BY created_at DESC;"],
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.kind, "snippet");
  assert.equal(entries[1]?.kind, "recent");
  assert.match(entries[0]?.summary ?? "", /DELETE FROM users/i);

  const filtered = filterSqlLibraryEntries(entries, "cleanup");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.title, "Cleanup users");
});

test("autocomplete includes keyword/template suggestions and biases the selected table", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public", "users");
  const relationItems = buildCompletionItems(context, null, "SELECT * FROM ", "SELECT * FROM ".length)
    .filter((item) => item.kind === "table" || item.kind === "view");
  const columnItems = buildCompletionItems(context, null, "SELECT ", "SELECT ".length)
    .filter((item) => item.kind === "column");
  const generalItems = buildCompletionItems(context, null, "", 0);

  assert.equal(relationItems[0]?.label, "users");
  assert.equal(columnItems[0]?.detail, "users (public)");
  assert.equal(
    generalItems.some((item) => item.kind === "template" && item.label === "SELECT template"),
    true,
  );
  assert.equal(
    generalItems.some((item) => item.kind === "keyword" && item.label === "WHERE"),
    true,
  );
});

test("workbench layout replaces raw snippet/history selects with the SQL library dialog", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /SQL library/);
  assert.match(workbench, /<SqlLibraryDialog/);
  assert.doesNotMatch(workbench, /workbench-recent-sql-select/);
  assert.doesNotMatch(workbench, /workbench-snippet-select/);
});
