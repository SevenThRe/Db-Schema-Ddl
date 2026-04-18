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
        foreignKeys: [
          {
            name: "fk_orders_users",
            columns: ["user_id"],
            referencedTable: "public.users",
            referencedColumns: ["id"],
          },
        ],
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
    routines: [
      {
        name: "public.coalesce_display_name",
        kind: "function",
        signature: "coalesce_display_name(name text, email text)",
        returnType: "text",
      },
    ],
    triggers: [],
    sequences: [],
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

test("CTE alias resolves projected columns inside the active statement scope", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql =
    "WITH recent_orders AS (SELECT user_id, total_amount FROM orders) SELECT ro. FROM recent_orders ro";
  const cursorOffset = sql.indexOf("ro.") + "ro.".length;
  const suggestions = buildCompletionItems(context, null, sql, cursorOffset);

  assert.ok(suggestions.some((item) => item.label === "user_id"));
  assert.ok(suggestions.some((item) => item.label === "total_amount"));
  assert.equal(suggestions.some((item) => item.label === "email"), false);
});

test("subquery alias resolves projected columns for nested SELECT sources", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql =
    "SELECT sub. FROM (SELECT id, email FROM users) sub";
  const cursorOffset = sql.indexOf("sub.") + "sub.".length;
  const suggestions = buildCompletionItems(context, null, sql, cursorOffset);

  assert.ok(suggestions.some((item) => item.label === "id"));
  assert.ok(suggestions.some((item) => item.label === "email"));
  assert.equal(suggestions.some((item) => item.label === "total_amount"), false);
});

test("JOIN scope prefers FK-aware join templates before plain relation names", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql = "SELECT * FROM users u JOIN ";
  const cursorOffset = sql.length;
  const suggestions = buildCompletionItems(context, null, sql, cursorOffset);

  assert.equal(suggestions[0]?.kind, "template");
  assert.match(suggestions[0]?.label ?? "", /JOIN orders via FK/i);
  assert.equal(
    suggestions.some(
      (item) =>
        item.kind === "template" &&
        item.insertText.includes("orders o ON o.user_id = u.id"),
    ),
    true,
  );
});

test("general and column scopes include routine/function suggestions", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const suggestions = buildCompletionItems(context, null, "SELECT ", "SELECT ".length);

  assert.equal(
    suggestions.some(
      (item) =>
        item.kind === "function" &&
        item.label === "coalesce_display_name" &&
        item.insertAsSnippet === true,
    ),
    true,
  );
});
