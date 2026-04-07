import test from "node:test";
import assert from "node:assert/strict";
import type { DbColumnSchema, DbSchemaSnapshot } from "../../shared/schema.ts";
import {
  buildAutocompleteContext,
  buildCompletionItems,
  resolveTableAlias,
} from "../../client/src/components/extensions/db-workbench/sql-autocomplete.ts";

function column(name: string): DbColumnSchema {
  return {
    name,
    dataType: "varchar",
    nullable: false,
    primaryKey: name === "id",
  };
}

function createSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "conn-phase16",
    connectionName: "phase16",
    database: "app_db",
    schema: "public",
    tables: [
      {
        name: "public.users",
        columns: [column("id"), column("email"), column("created_at")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "public.orders",
        columns: [column("id"), column("user_id"), column("total_amount")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "audit.events",
        columns: [column("id"), column("event_type")],
        indexes: [],
        foreignKeys: [],
      },
    ],
    views: [
      {
        name: "public.active_users",
        columns: [column("id"), column("email")],
      },
      {
        name: "audit.old_events",
        columns: [column("id"), column("event_type")],
      },
    ],
  };
}

test("active-schema suggestions include tables/views from the scoped schema", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const suggestions = buildCompletionItems(context, null);

  assert.ok(
    suggestions.some((item) => item.kind === "table" && item.label === "users"),
  );
  assert.ok(
    suggestions.some(
      (item) => item.kind === "view" && item.label === "active_users",
    ),
  );
});

test("non-active schema entries are excluded when scope is set", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const suggestions = buildCompletionItems(context, null);

  assert.equal(context.schemas.includes("audit"), false);
  assert.equal(
    suggestions.some((item) => item.label === "events" || item.label === "old_events"),
    false,
  );
});

test("alias `u` resolves users columns for SELECT u. context", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql = "SELECT u. FROM users u";
  const cursorOffset = sql.indexOf("u.") + "u.".length;
  const aliasHint = resolveTableAlias(sql, cursorOffset);
  const suggestions = buildCompletionItems(context, aliasHint);

  assert.ok(aliasHint);
  assert.equal(aliasHint?.alias, "u");
  assert.ok(suggestions.some((item) => item.label === "email"));
  assert.equal(
    suggestions.some((item) => item.label === "total_amount"),
    false,
  );
});

test("alias `o` resolves orders columns after JOIN orders o", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql =
    "SELECT o. FROM users u JOIN orders o ON o.user_id = u.id";
  const cursorOffset = sql.indexOf("SELECT o.") + "SELECT o.".length;
  const aliasHint = resolveTableAlias(sql, cursorOffset);
  const suggestions = buildCompletionItems(context, aliasHint);

  assert.ok(aliasHint);
  assert.equal(aliasHint?.alias, "o");
  assert.ok(suggestions.some((item) => item.label === "total_amount"));
  assert.equal(suggestions.some((item) => item.label === "email"), false);
});
