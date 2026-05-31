import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvRows } from "../../client/src/components/extensions/db-workbench/csv-parse";
import {
  buildCsvImportPlan,
  csvKindToType,
  inferCsvColumnKind,
  inferCsvImportColumns,
} from "../../client/src/components/extensions/db-workbench/csv-import-model";

test("parseCsvRows handles quotes, embedded delimiters/newlines, and escaped quotes", () => {
  const rows = parseCsvRows(
    'id,note\r\n1,"hello, world"\r\n2,"line1\nline2"\r\n3,"she said ""hi"""\r\n',
  );
  assert.deepEqual(rows, [
    ["id", "note"],
    ["1", "hello, world"],
    ["2", "line1\nline2"],
    ["3", 'she said "hi"'],
  ]);
});

test("parseCsv splits header from body and synthesizes headers when absent", () => {
  const withHeader = parseCsv("a,b\n1,2\n3,4\n");
  assert.deepEqual(withHeader.headers, ["a", "b"]);
  assert.equal(withHeader.rows.length, 2);

  const noHeader = parseCsv("1,2\n3,4", { hasHeader: false });
  assert.deepEqual(noHeader.headers, ["column_1", "column_2"]);
  assert.equal(noHeader.rows.length, 2);
});

test("inferCsvColumnKind picks the most permissive consistent kind", () => {
  assert.equal(inferCsvColumnKind(["1", "2", "3"]), "integer");
  assert.equal(inferCsvColumnKind(["1", "2.5", ""]), "decimal"); // int+decimal -> decimal
  assert.equal(inferCsvColumnKind(["2026-01-02", "2026-06-01T08:00:00Z"]), "datetime");
  assert.equal(inferCsvColumnKind(["true", "false"]), "boolean");
  assert.equal(inferCsvColumnKind(["1", "abc"]), "text"); // mixed -> text
  assert.equal(inferCsvColumnKind(["", ""]), "text"); // all empty -> text
});

test("csvKindToType maps kinds to driver-specific types", () => {
  assert.equal(csvKindToType("integer", "mysql", 0), "int");
  assert.equal(csvKindToType("integer", "postgres", 0), "integer");
  assert.equal(csvKindToType("datetime", "postgres", 0), "timestamptz");
  assert.equal(csvKindToType("boolean", "mysql", 0), "tinyint(1)");
  assert.match(csvKindToType("text", "mysql", 10), /^varchar\(\d+\)$/);
  assert.equal(csvKindToType("text", "mysql", 1000), "text");
});

test("inferCsvImportColumns infers per-column types from sample rows", () => {
  const columns = inferCsvImportColumns(
    ["id", "amount", "created_at", "note"],
    [
      ["1", "9.99", "2026-01-01", "hello"],
      ["2", "19.50", "2026-02-01T00:00:00Z", "world"],
    ],
    "mysql",
  );
  assert.equal(columns[0]?.dataType, "int");
  assert.equal(columns[1]?.dataType, "decimal(18,6)");
  assert.equal(columns[2]?.dataType, "datetime");
  assert.match(columns[3]?.dataType ?? "", /^varchar\(\d+\)$/);
});

test("buildCsvImportPlan emits CREATE + INSERT with blanks as NULL", () => {
  const plan = buildCsvImportPlan(
    "id,email\n1,a@example.com\n2,\n",
    { driver: "mysql", tableName: "people", createTable: true },
  );

  assert.equal(plan.rowCount, 2);
  assert.match(plan.createDdl ?? "", /CREATE TABLE `people`/);
  assert.match(plan.createDdl ?? "", /`id` int/);
  assert.match(plan.insertScript, /INSERT INTO `people` \(`id`, `email`\) VALUES/);
  assert.match(plan.insertScript, /\(1, 'a@example\.com'\)/);
  // The blank email cell becomes NULL, not an empty string literal.
  assert.match(plan.insertScript, /\(2, NULL\)/);
});

test("buildCsvImportPlan can skip CREATE for an existing table", () => {
  const plan = buildCsvImportPlan("a,b\n1,2\n", {
    driver: "postgres",
    tableName: "t",
    schemaName: "app",
    createTable: false,
  });
  assert.equal(plan.createDdl, null);
  assert.match(plan.insertScript, /INSERT INTO "app"\."t" \("a", "b"\) VALUES/);
});
