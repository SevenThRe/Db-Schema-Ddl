import test from "node:test";
import assert from "node:assert/strict";
import type { DbTableSchema } from "../../shared/schema";
import {
  buildStarterTableQuery,
  resolveQualifiedTableName,
} from "../../client/src/components/extensions/db-workbench/table-query-utils";

const usersTable: DbTableSchema = {
  name: "users",
  columns: [
    { name: "id", dataType: "bigint", nullable: false, primaryKey: true },
    { name: "email", dataType: "varchar", nullable: false },
  ],
  indexes: [],
  foreignKeys: [],
};

test("table query utils quote qualified names per driver", () => {
  assert.equal(
    resolveQualifiedTableName({
      driver: "mysql",
      tableName: "user`profile",
    }),
    "`user``profile`",
  );
  assert.equal(
    resolveQualifiedTableName({
      driver: "postgres",
      tableName: 'user"profile',
      runtimeSchema: "app",
    }),
    '"app"."user""profile"',
  );
});

test("table query utils build select, count, and explicit column starters", () => {
  assert.deepEqual(
    buildStarterTableQuery({
      driver: "postgres",
      tableName: "users",
      mode: "select",
      table: usersTable,
      runtimeSchema: "app",
    }),
    {
      sql: 'SELECT *\nFROM "app"."users"\nLIMIT 100;',
      source: {
        kind: "starter-select",
        tableName: "users",
        schema: "app",
        queryMode: "select",
      },
    },
  );

  assert.equal(
    buildStarterTableQuery({
      driver: "mysql",
      tableName: "users",
      mode: "count",
      table: usersTable,
    }).sql,
    "SELECT COUNT(*) AS total_count\nFROM `users`;",
  );

  assert.equal(
    buildStarterTableQuery({
      driver: "mysql",
      tableName: "users",
      mode: "columns",
      table: usersTable,
    }).sql,
    "SELECT\n  `id`,\n  `email`\nFROM `users`\nLIMIT 100;",
  );
});
