import test from "node:test";
import assert from "node:assert/strict";
import type { DbColumnSchema, DbSchemaSnapshot } from "../../shared/schema.ts";
import { buildAutocompleteContext as buildContextDirect } from "../../client/src/components/extensions/db-workbench/sql-autocomplete-context";
import { buildAutocompleteContext as buildContextFromFacade } from "../../client/src/components/extensions/db-workbench/sql-autocomplete";

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
    connectionId: "conn-autocomplete-context",
    connectionName: "autocomplete-context",
    database: "app_db",
    schema: "public",
    tables: [
      {
        name: "public.users",
        columns: [column("id"), column("email")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "public.orders",
        columns: [column("id"), column("user_id")],
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
    ],
    routines: [
      {
        name: "public.lookup_user",
        kind: "function",
        signature: "lookup_user(email text)",
        returnType: "uuid",
      },
    ],
    triggers: [],
    sequences: [],
  };
}

test("sql autocomplete context builder scopes schema metadata and join edges", () => {
  const context = buildContextDirect(createSnapshot(), "public", "users", "postgres");

  assert.deepEqual(
    context.relations.map((relation) => `${relation.kind}:${relation.name}`),
    ["table:orders", "table:users", "view:active_users"],
  );
  assert.deepEqual(
    context.columns.map((column) => `${column.relation}.${column.name}`),
    [
      "active_users.email",
      "users.email",
      "active_users.id",
      "orders.id",
      "users.id",
      "orders.user_id",
    ],
  );
  assert.deepEqual(context.schemas, ["public"]);
  assert.equal(context.selectedRelation, "users");
  assert.deepEqual(
    context.routines.map((routine) => `${routine.kind}:${routine.name}:${routine.returnType}`),
    ["function:lookup_user:uuid"],
  );
  assert.deepEqual(context.joinEdges, [
    {
      sourceSchema: "public",
      sourceRelation: "orders",
      targetSchema: "public",
      targetRelation: "users",
      sourceColumns: ["user_id"],
      targetColumns: ["id"],
      foreignKeyName: "fk_orders_users",
    },
  ]);
});

test("sql autocomplete facade preserves the context builder entrypoint", () => {
  assert.deepEqual(
    buildContextFromFacade(null, undefined),
    buildContextDirect(null, undefined),
  );
});
