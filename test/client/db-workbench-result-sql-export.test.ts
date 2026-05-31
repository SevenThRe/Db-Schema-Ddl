import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInsertScript,
  escapeExportStringLiteral,
  formatSqlValue,
} from "../../client/src/components/extensions/db-workbench/result-sql-export";

test("formatSqlValue renders NULL / boolean / number / string per driver", () => {
  assert.equal(formatSqlValue(null, "mysql"), "NULL");
  assert.equal(formatSqlValue(true, "postgres"), "TRUE");
  assert.equal(formatSqlValue(false, "mysql"), "FALSE");
  assert.equal(formatSqlValue(42, "mysql"), "42");
  assert.equal(formatSqlValue(3.14, "postgres"), "3.14");
  assert.equal(formatSqlValue(Number.POSITIVE_INFINITY, "mysql"), "NULL");
  assert.equal(formatSqlValue("plain", "postgres"), "'plain'");
});

test("string escaping is injection-safe and driver-aware for backslashes", () => {
  assert.equal(escapeExportStringLiteral("O'Brien", "postgres"), "O''Brien");
  // MySQL treats backslash as an escape char, so it must be doubled.
  assert.equal(escapeExportStringLiteral("a\\b", "mysql"), "a\\\\b");
  // PostgreSQL (standard strings) keeps the backslash literal.
  assert.equal(escapeExportStringLiteral("a\\b", "postgres"), "a\\b");
  // A classic injection payload stays a single inert literal.
  assert.equal(
    formatSqlValue("'); DROP TABLE users;--", "mysql"),
    "'''); DROP TABLE users;--'",
  );
});

test("buildInsertScript emits batched multi-row inserts with quoted identifiers", () => {
  const script = buildInsertScript({
    driver: "mysql",
    tableName: "users",
    columns: [{ name: "id" }, { name: "email" }, { name: "active" }],
    rows: [
      [1, "a@example.com", true],
      [2, "b@example.com", false],
      [3, null, true],
    ],
    batchSize: 2,
  });

  // Two batches (2 + 1) because batchSize=2.
  const inserts = script.match(/INSERT INTO/g) ?? [];
  assert.equal(inserts.length, 2);
  assert.match(script, /INSERT INTO `users` \(`id`, `email`, `active`\) VALUES/);
  assert.match(script, /\(1, 'a@example\.com', TRUE\)/);
  assert.match(script, /\(3, NULL, TRUE\)/);
});

test("buildInsertScript supports one-statement-per-row mode and PG quoting", () => {
  const script = buildInsertScript({
    driver: "postgres",
    tableName: "orders",
    schemaName: "app",
    columns: [{ name: "id" }, { name: "note" }],
    rows: [[1, "hi"]],
    multiRow: false,
  });
  assert.equal(
    script,
    `INSERT INTO "app"."orders" ("id", "note") VALUES (1, 'hi');`,
  );
});

test("buildInsertScript returns empty string when there is nothing to export", () => {
  assert.equal(
    buildInsertScript({ driver: "mysql", tableName: "t", columns: [], rows: [] }),
    "",
  );
  assert.equal(
    buildInsertScript({
      driver: "mysql",
      tableName: "t",
      columns: [{ name: "id" }],
      rows: [],
    }),
    "",
  );
});
