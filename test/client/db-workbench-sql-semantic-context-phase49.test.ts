import test from "node:test";
import assert from "node:assert/strict";
import type { DbColumnSchema, DbSchemaSnapshot } from "../../shared/schema.ts";
import { buildAutocompleteContext } from "../../client/src/components/extensions/db-workbench/sql-autocomplete.ts";
import {
  analyzeSqlContext,
  resolveSemanticHoverSymbol,
} from "../../client/src/components/extensions/db-workbench/sql-semantic-context.ts";

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
    connectionId: "conn-phase49",
    connectionName: "phase49",
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

test("SELECT analysis resolves clause, scope, and alias binding at the cursor", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql = "SELECT u. FROM users u WHERE u.email IS NOT NULL";
  const cursorOffset = sql.indexOf("u.") + "u.".length;
  const analysis = analyzeSqlContext(context, sql, cursorOffset);

  assert.equal(analysis.statement.kind, "select");
  assert.equal(analysis.clause, "select");
  assert.equal(analysis.scope, "column");
  assert.equal(analysis.activeBinding?.alias, "u");
  assert.deepEqual(analysis.activeBinding?.relation.columns, [
    "created_at",
    "email",
    "id",
  ]);
});

test("WITH analysis lifts CTE relations into the shared semantic context", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql =
    "WITH recent_orders AS (SELECT user_id, total_amount FROM orders) SELECT ro. FROM recent_orders ro";
  const cursorOffset = sql.indexOf("ro.") + "ro.".length;
  const analysis = analyzeSqlContext(context, sql, cursorOffset);

  assert.equal(analysis.statement.kind, "select");
  assert.equal(analysis.statement.ctes.length, 1);
  assert.equal(analysis.statement.ctes[0]?.name, "recent_orders");
  assert.equal(analysis.activeBinding?.relation.kind, "cte");
  assert.deepEqual(analysis.activeBinding?.relation.columns, [
    "user_id",
    "total_amount",
  ]);
});

test("INSERT, UPDATE, and DELETE contexts resolve the expected statement and clause", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");

  const insertSql = "INSERT INTO ";
  const insertAnalysis = analyzeSqlContext(context, insertSql, insertSql.length);
  assert.equal(insertAnalysis.statement.kind, "insert");
  assert.equal(insertAnalysis.clause, "into");
  assert.equal(insertAnalysis.scope, "relation");

  const updateSql = "UPDATE users SET ";
  const updateAnalysis = analyzeSqlContext(context, updateSql, updateSql.length);
  assert.equal(updateAnalysis.statement.kind, "update");
  assert.equal(updateAnalysis.clause, "set");
  assert.equal(updateAnalysis.scope, "column");

  const deleteSql = "DELETE FROM users WHERE ";
  const deleteAnalysis = analyzeSqlContext(context, deleteSql, deleteSql.length);
  assert.equal(deleteAnalysis.statement.kind, "delete");
  assert.equal(deleteAnalysis.clause, "where");
  assert.equal(deleteAnalysis.scope, "column");
});

test("hover symbol resolves bound relations and columns from the semantic context", () => {
  const context = buildAutocompleteContext(createSnapshot(), "public");
  const sql = "SELECT u.email FROM users u";

  const aliasSymbol = resolveSemanticHoverSymbol(
    context,
    sql,
    sql.indexOf("u.email") + 1,
  );
  assert.equal(aliasSymbol?.kind, "relation");
  assert.match(aliasSymbol?.detail ?? "", /table \(public\)/i);

  const columnSymbol = resolveSemanticHoverSymbol(
    context,
    sql,
    sql.indexOf("email") + 2,
  );
  assert.equal(columnSymbol?.kind, "column");
  assert.match(columnSymbol?.detail ?? "", /column from users/i);
});
