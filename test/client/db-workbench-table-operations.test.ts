import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDropTableSql,
  buildDuplicateTableStructureSql,
  buildRenameTableSql,
  buildTruncateTableSql,
  isDestructiveTableOperation,
} from "../../client/src/components/extensions/db-workbench/table-operations-model";

test("drop / truncate generate driver-quoted, schema-qualified SQL", () => {
  assert.equal(buildDropTableSql("users", "mysql"), "DROP TABLE `users`;");
  assert.equal(
    buildDropTableSql("users", "mysql", { ifExists: true }),
    "DROP TABLE IF EXISTS `users`;",
  );
  assert.equal(
    buildDropTableSql("users", "postgres", { schemaName: "app" }),
    'DROP TABLE "app"."users";',
  );
  assert.equal(buildTruncateTableSql("logs", "mysql"), "TRUNCATE TABLE `logs`;");
});

test("rename uses the driver-correct form", () => {
  assert.equal(
    buildRenameTableSql("old", "new", "mysql"),
    "RENAME TABLE `old` TO `new`;",
  );
  assert.equal(
    buildRenameTableSql("old", "new", "postgres", "app"),
    'ALTER TABLE "app"."old" RENAME TO "new";',
  );
});

test("duplicate-structure uses LIKE (MySQL) and LIKE INCLUDING ALL (PostgreSQL)", () => {
  assert.equal(
    buildDuplicateTableStructureSql("orders", "orders_copy", "mysql"),
    "CREATE TABLE `orders_copy` LIKE `orders`;",
  );
  assert.equal(
    buildDuplicateTableStructureSql("orders", "orders_copy", "postgres", "app"),
    'CREATE TABLE "app"."orders_copy" (LIKE "app"."orders" INCLUDING ALL);',
  );
});

test("destructive operations are flagged for the dangerous-SQL gate", () => {
  assert.equal(isDestructiveTableOperation("drop"), true);
  assert.equal(isDestructiveTableOperation("truncate"), true);
  assert.equal(isDestructiveTableOperation("rename"), true);
  assert.equal(isDestructiveTableOperation("duplicate-structure"), false);
});
