import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIdentifier,
  parseQualifiedIdentifier,
  resolveStatementWindow,
  splitTopLevelSegments,
  tokenizeSql,
  toLookupKey,
} from "../../client/src/components/extensions/db-workbench/sql-lexer";

test("sql lexer normalizes quoted identifiers and lookup keys", () => {
  assert.equal(normalizeIdentifier('"Order Items"'), "order items");
  assert.equal(normalizeIdentifier("`CustomerID`"), "customerid");
  assert.equal(toLookupKey("Public", '"Order Items"'), "public.order items");
});

test("sql lexer parses qualified identifiers with driver quotes", () => {
  assert.deepEqual(parseQualifiedIdentifier('"public"."users"'), {
    schema: "public",
    relation: "users",
  });
  assert.deepEqual(parseQualifiedIdentifier("`app`.`orders`"), {
    schema: "app",
    relation: "orders",
  });
  assert.deepEqual(parseQualifiedIdentifier("orders"), { relation: "orders" });
});

test("sql lexer tokenizes comments strings and nested punctuation without leaking literals", () => {
  const tokens = tokenizeSql("select 'a,b', users.id from users -- ignored\nwhere id = 1");
  assert.deepEqual(
    tokens.map((token) => token.text),
    ["select", ",", "users", ".", "id", "from", "users", "where", "id", "1"],
  );
});

test("sql lexer splits top-level segments while preserving nested expressions", () => {
  assert.deepEqual(
    splitTopLevelSegments("id, concat(first_name, ', ', last_name) as full_name, status"),
    ["id", "concat(first_name, ', ', last_name) as full_name", "status"],
  );
});

test("sql lexer resolves the statement at cursor without crossing semicolons", () => {
  const sql = "select 1;\nselect * from users;\nselect 3";
  const cursor = sql.indexOf("users");
  assert.deepEqual(resolveStatementWindow(sql, cursor), {
    statementSql: "\nselect * from users",
    statementOffset: 9,
    cursorOffsetInStatement: 15,
  });
});
