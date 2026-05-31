import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeleteStatement,
  buildInsertStatement,
  buildSelectStatement,
  buildUpdateStatement,
} from "../../client/src/components/extensions/db-workbench/statement-builder-model";

test("SELECT statement quotes columns, qualifies schema, and adds LIMIT", () => {
  assert.equal(
    buildSelectStatement("users", ["id", "email"], "mysql", { limit: 100 }),
    "SELECT `id`, `email` FROM `users` LIMIT 100;",
  );
  assert.equal(
    buildSelectStatement("users", [], "postgres", { schemaName: "app" }),
    'SELECT * FROM "app"."users";',
  );
});

test("INSERT/UPDATE/DELETE emit `?` placeholders by default", () => {
  assert.equal(
    buildInsertStatement("users", ["id", "email"], "mysql"),
    "INSERT INTO `users` (`id`, `email`) VALUES (?, ?);",
  );
  assert.equal(
    buildUpdateStatement("users", ["email"], ["id"], "mysql"),
    "UPDATE `users` SET `email` = ? WHERE `id` = ?;",
  );
  assert.equal(
    buildDeleteStatement("users", ["id"], "postgres", { schemaName: "app" }),
    'DELETE FROM "app"."users" WHERE "id" = ?;',
  );
});

test("supplying concrete values produces runnable, injection-safe statements", () => {
  assert.equal(
    buildInsertStatement("users", ["id", "email"], "mysql", {
      values: [1, "a@example.com"],
    }),
    "INSERT INTO `users` (`id`, `email`) VALUES (1, 'a@example.com');",
  );
  assert.equal(
    buildUpdateStatement("users", ["email"], ["id"], "mysql", {
      setValues: ["O'Brien"],
      pkValues: [7],
    }),
    "UPDATE `users` SET `email` = 'O''Brien' WHERE `id` = 7;",
  );
  assert.equal(
    buildDeleteStatement("users", ["id"], "mysql", { pkValues: [9] }),
    "DELETE FROM `users` WHERE `id` = 9;",
  );
});
