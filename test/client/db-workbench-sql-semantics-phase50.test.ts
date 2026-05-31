import test from "node:test";
import assert from "node:assert/strict";
import type { DbColumnSchema, DbSchemaSnapshot } from "../../shared/schema.ts";
import {
  buildAutocompleteContext,
  buildCompletionItems,
} from "../../client/src/components/extensions/db-workbench/sql-autocomplete.ts";
import { collectSemanticDiagnostics } from "../../client/src/components/extensions/db-workbench/sql-semantic-context.ts";

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
    connectionId: "conn-phase50",
    connectionName: "phase50",
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
    ],
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

test("driver-aware catalogs expose different builtins, types, and system schemas", () => {
  const postgresContext = buildAutocompleteContext(createSnapshot(), "public", null, "postgres");
  const mysqlContext = buildAutocompleteContext(createSnapshot(), "public", null, "mysql");

  const postgresItems = buildCompletionItems(
    postgresContext,
    null,
    "SELECT ",
    "SELECT ".length,
  );
  const mysqlItems = buildCompletionItems(
    mysqlContext,
    null,
    "SELECT ",
    "SELECT ".length,
  );

  assert.equal(
    postgresItems.some((item) => item.kind === "function" && item.label === "STRING_AGG"),
    true,
  );
  assert.equal(
    postgresItems.some((item) => item.kind === "type" && item.label === "jsonb"),
    true,
  );
  assert.equal(
    postgresItems.some((item) => item.kind === "schema" && item.label === "pg_catalog"),
    true,
  );

  assert.equal(
    mysqlItems.some((item) => item.kind === "function" && item.label === "IFNULL"),
    true,
  );
  assert.equal(
    mysqlItems.some((item) => item.kind === "type" && item.label === "datetime"),
    true,
  );
  assert.equal(
    mysqlItems.some((item) => item.kind === "schema" && item.label === "performance_schema"),
    true,
  );
});

test("ON clause suggestions synthesize FK join conditions from active bindings", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public", null, "postgres");
  const sql = "SELECT * FROM users u JOIN orders o ON ";
  const suggestions = buildCompletionItems(context, null, sql, sql.length);

  assert.equal(
    suggestions.some(
      (item) =>
        item.kind === "template" &&
        item.insertText === "o.user_id = u.id",
    ),
    true,
  );
});

test("semantic diagnostics surface high-signal SQL guidance before execution", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public", null, "postgres");

  const brokenJoinDiagnostics = collectSemanticDiagnostics(
    context,
    "SELECT o.unknown FROM users u JOIN orders o",
  );
  assert.equal(
    brokenJoinDiagnostics.some((item) => item.code === "unknown_column"),
    true,
  );
  assert.equal(
    brokenJoinDiagnostics.some((item) => item.code === "missing_join_condition"),
    true,
  );

  const unknownRelationDiagnostics = collectSemanticDiagnostics(
    context,
    "SELECT * FROM ghosts",
  );
  assert.equal(
    unknownRelationDiagnostics.some((item) => item.code === "unknown_relation"),
    true,
  );

  const riskyDmlDiagnostics = collectSemanticDiagnostics(
    context,
    "UPDATE users SET email = 'x'; DELETE FROM users;",
  );
  assert.equal(
    riskyDmlDiagnostics.some((item) => item.code === "update_without_where"),
    true,
  );
  assert.equal(
    riskyDmlDiagnostics.some((item) => item.code === "delete_without_where"),
    true,
  );
});
