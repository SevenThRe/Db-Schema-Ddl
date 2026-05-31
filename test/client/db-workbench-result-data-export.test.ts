import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCsvExport,
  buildJsonExport,
} from "../../client/src/components/extensions/db-workbench/result-data-export";
import { parseCsv } from "../../client/src/components/extensions/db-workbench/csv-parse";

const columns = [{ name: "id" }, { name: "note" }, { name: "active" }];
const rows: (string | number | boolean | null)[][] = [
  [1, "hello, world", true],
  [2, 'has "quotes"\nand newline', false],
  [3, null, true],
];

test("buildCsvExport quotes fields with delimiter/quote/newline and renders header", () => {
  const csv = buildCsvExport(columns, rows);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "id,note,active");
  assert.equal(lines[1], '1,"hello, world",true');
  assert.match(csv, /"has ""quotes""\nand newline"/);
  // null becomes an empty field.
  assert.match(csv, /3,,true/);
});

test("CSV export round-trips through the CSV parser", () => {
  const csv = buildCsvExport(columns, rows);
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.headers, ["id", "note", "active"]);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.rows[1], ["2", 'has "quotes"\nand newline', "false"]);
  assert.deepEqual(parsed.rows[2], ["3", "", "true"]);
});

test("buildJsonExport emits an array of column-keyed records preserving null", () => {
  const json = JSON.parse(buildJsonExport(columns, rows));
  assert.equal(json.length, 3);
  assert.deepEqual(json[0], { id: 1, note: "hello, world", active: true });
  assert.equal(json[2].note, null);
});

test("buildCsvExport can omit the header and use a custom delimiter", () => {
  const csv = buildCsvExport(columns, [[1, "a", true]], {
    includeHeader: false,
    delimiter: ";",
    newline: "\n",
  });
  assert.equal(csv, "1;a;true");
});
