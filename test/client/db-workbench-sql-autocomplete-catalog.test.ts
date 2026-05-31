import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIVER_FUNCTION_ITEMS,
  DRIVER_SYSTEM_SCHEMAS,
  DRIVER_TYPE_ITEMS,
  SQL_KEYWORD_ITEMS,
} from "../../client/src/components/extensions/db-workbench/sql-autocomplete-catalog";

test("sql autocomplete catalog keeps driver-specific builtins centralized", () => {
  assert.equal(DRIVER_FUNCTION_ITEMS.postgres.some((item) => item.label === "STRING_AGG"), true);
  assert.equal(DRIVER_FUNCTION_ITEMS.mysql.some((item) => item.label === "IFNULL"), true);
  assert.equal(DRIVER_TYPE_ITEMS.postgres.some((item) => item.label === "jsonb"), true);
  assert.equal(DRIVER_TYPE_ITEMS.mysql.some((item) => item.label === "varchar"), true);
});

test("sql autocomplete catalog keeps schema and template entries available", () => {
  assert.deepEqual(DRIVER_SYSTEM_SCHEMAS.postgres.slice(0, 2), [
    "public",
    "information_schema",
  ]);
  assert.equal(SQL_KEYWORD_ITEMS.some((item) => item.label === "SELECT template"), true);
});
