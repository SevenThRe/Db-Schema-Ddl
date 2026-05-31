import test from "node:test";
import assert from "node:assert/strict";
import type { DbTableSchema } from "../../shared/schema";
import { buildTableSqlDump } from "../../client/src/components/extensions/db-workbench/table-sql-dump-model";

function schema(): DbTableSchema {
  return {
    name: "users",
    columns: [
      { name: "id", dataType: "int", nullable: false, primaryKey: true },
      { name: "email", dataType: "varchar(255)", nullable: false, primaryKey: false },
    ],
  };
}

const rows: (string | number | null)[][] = [
  [1, "a@example.com"],
  [2, "b@example.com"],
];

test("dump emits DROP + CREATE + INSERT by default", () => {
  const sql = buildTableSqlDump(schema(), rows, { driver: "mysql" });
  assert.match(sql, /DROP TABLE IF EXISTS `users`;/);
  assert.match(sql, /CREATE TABLE `users`/);
  assert.match(sql, /PRIMARY KEY \(`id`\)/);
  assert.match(sql, /INSERT INTO `users` \(`id`, `email`\) VALUES/);
  // ordering: drop before create before insert
  assert.ok(sql.indexOf("DROP TABLE") < sql.indexOf("CREATE TABLE"));
  assert.ok(sql.indexOf("CREATE TABLE") < sql.indexOf("INSERT INTO"));
});

test("dump can emit structure-only or data-only", () => {
  const structureOnly = buildTableSqlDump(schema(), rows, {
    driver: "postgres",
    includeData: false,
    dropBeforeCreate: false,
  });
  assert.match(structureOnly, /CREATE TABLE "users"/);
  assert.doesNotMatch(structureOnly, /INSERT INTO/);
  assert.doesNotMatch(structureOnly, /DROP TABLE/);

  const dataOnly = buildTableSqlDump(schema(), rows, {
    driver: "mysql",
    includeStructure: false,
  });
  assert.doesNotMatch(dataOnly, /CREATE TABLE/);
  assert.match(dataOnly, /INSERT INTO `users`/);
});

test("dump with no rows omits the INSERT section", () => {
  const sql = buildTableSqlDump(schema(), [], { driver: "mysql" });
  assert.match(sql, /CREATE TABLE `users`/);
  assert.doesNotMatch(sql, /INSERT INTO/);
});
