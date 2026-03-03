import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  detectExcelFormat,
  getSheetData,
  parseSheetRegion,
  parseTableDefinition,
  parseWorkbookBundle,
} from "../../server/lib/excel";
import { EXCEL_LABELS } from "../../server/constants/excel-parser";

async function withTempWorkbook<T>(
  filename: string,
  rows: unknown[][],
  run: (filePath: string) => Promise<T> | T,
): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-edge-cases-"));
  const filePath = path.join(tempDir, filename);
  try {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, filePath);
    return await run(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sparseRow(cells: Record<number, unknown>): unknown[] {
  const row: unknown[] = [];
  Object.entries(cells).forEach(([index, value]) => {
    row[Number(index)] = value;
  });
  return row;
}

test("detectExcelFormat handles empty, unknown, and ambiguous score sheets", () => {
  const empty = detectExcelFormat([]);
  assert.equal(empty.format, "UNKNOWN");
  assert.deepEqual(empty.reasons, ["empty_sheet"]);

  const unknown = detectExcelFormat([["alpha", "beta"]]);
  assert.equal(unknown.format, "UNKNOWN");
  assert.deepEqual(unknown.reasons, ["no_known_markers"]);

  const ambiguous = detectExcelFormat([[EXCEL_LABELS.logicalTableName, EXCEL_LABELS.physicalTableName]]);
  assert.equal(ambiguous.format, "UNKNOWN");
  assert.equal(ambiguous.scoreA, ambiguous.scoreB);
  assert.ok(ambiguous.reasons.includes("ambiguous_scores"));
});

test("parseSheetRegion resolves table names from rows above selected region", async () => {
  await withTempWorkbook(
    "upward-search.xlsx",
    [
      [EXCEL_LABELS.logicalTableName, "User"],
      [EXCEL_LABELS.physicalTableName, "user_table"],
      [],
      [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType],
      [1, "Id", "id", "bigint"],
    ],
    async (filePath) => {
      const tables = parseSheetRegion(filePath, "Sheet1", 3, 10, 0, 3);
      assert.equal(tables.length, 1);
      assert.equal(tables[0].logicalTableName, "User");
      assert.equal(tables[0].physicalTableName, "user_table");
      assert.equal(tables[0].columns.length, 1);
      assert.equal(tables[0].columns[0].physicalName, "id");
      assert.equal(tables[0].sourceRef?.logicalName?.address, "B1");
      assert.equal(tables[0].sourceRef?.physicalName?.address, "B2");
    },
  );
});

test("parseSheetRegion resolves format-B vertical table list metadata", async () => {
  await withTempWorkbook(
    "format-b-vertical-metadata.xlsx",
    [
      sparseRow({
        0: EXCEL_LABELS.noDot,
        1: EXCEL_LABELS.logicalTableName,
        2: EXCEL_LABELS.physicalTableName,
      }),
      sparseRow({
        0: 1,
        1: "Order",
        2: "order_table",
      }),
      [],
      sparseRow({
        10: EXCEL_LABELS.no,
        11: EXCEL_LABELS.logicalName,
        12: EXCEL_LABELS.physicalName,
        13: EXCEL_LABELS.dataType,
      }),
      sparseRow({
        10: 1,
        11: "Id",
        12: "id",
        13: "int",
      }),
    ],
    async (filePath) => {
      const tables = parseSheetRegion(filePath, "Sheet1", 3, 10, 10, 13);
      assert.equal(tables.length, 1);
      assert.equal(tables[0].logicalTableName, "Order");
      assert.equal(tables[0].physicalTableName, "order_table");
      assert.equal(tables[0].sourceRef?.logicalName?.address, "B2");
      assert.equal(tables[0].sourceRef?.physicalName?.address, "C2");
      assert.equal(tables[0].columns[0].physicalName, "id");
    },
  );
});

test("parseSheetRegion returns empty result when header row is missing", async () => {
  await withTempWorkbook(
    "region-no-header.xlsx",
    [
      [EXCEL_LABELS.logicalTableName, "NoHeader"],
      [EXCEL_LABELS.physicalTableName, "no_header"],
      ["foo", "bar"],
    ],
    async (filePath) => {
      const tables = parseSheetRegion(filePath, "Sheet1", 2, 5, 0, 3);
      assert.deepEqual(tables, []);
    },
  );
});

test("getSheetData throws when requested sheet does not exist", async () => {
  await withTempWorkbook(
    "missing-sheet.xlsx",
    [["x"]],
    async (filePath) => {
      assert.throws(
        () => getSheetData(filePath, "NotFound"),
        /Sheet NotFound not found/,
      );
    },
  );
});

test("parseTableDefinition falls back to sheet name when no table could be parsed", async () => {
  await withTempWorkbook(
    "no-table-definition.xlsx",
    [["just", "data"], ["without", "headers"]],
    async (filePath) => {
      const table = parseTableDefinition(filePath, "Sheet1");
      assert.equal(table.logicalTableName, "Sheet1");
      assert.equal(table.physicalTableName, "Sheet1");
      assert.equal(table.columns.length, 0);
    },
  );
});

test("parseWorkbookBundle parses vertical format-B table blocks", async () => {
  await withTempWorkbook(
    "format-b-vertical.xlsx",
    [
      [EXCEL_LABELS.databaseDefinition],
      [EXCEL_LABELS.noDot, EXCEL_LABELS.logicalTableName, EXCEL_LABELS.physicalTableName, "desc"],
      [1, "User", "user_table", ""],
      [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType],
      [1, "Id", "id", "bigint"],
      [],
      [EXCEL_LABELS.noDot, EXCEL_LABELS.logicalTableName, EXCEL_LABELS.physicalTableName, "desc"],
      [2, "Department", "dept_table", ""],
      [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType],
      [1, "Id", "id", "int"],
    ],
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.equal(tables.length, 2);
      assert.equal(tables[0].physicalTableName, "user_table");
      assert.equal(tables[1].physicalTableName, "dept_table");
      assert.equal(bundle.stats.detectedFormatCounts.B, 1);
    },
  );
});

test("parseWorkbookBundle parses horizontal format-A blocks inside format-B sheets", async () => {
  await withTempWorkbook(
    "format-b-horizontal.xlsx",
    [
      sparseRow({
        0: EXCEL_LABELS.databaseDefinition,
        10: EXCEL_LABELS.tableInfo,
      }),
      sparseRow({
        10: EXCEL_LABELS.logicalTableName,
        11: "Horizontal",
      }),
      sparseRow({
        10: EXCEL_LABELS.physicalTableName,
        11: "horizontal_table",
      }),
      [],
      sparseRow({
        10: EXCEL_LABELS.no,
        11: EXCEL_LABELS.logicalName,
        12: EXCEL_LABELS.physicalName,
        13: EXCEL_LABELS.dataType,
      }),
      sparseRow({
        10: 1,
        11: "Id",
        12: "id",
        13: "bigint",
      }),
    ],
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.ok(tables.some((table) => table.physicalTableName === "horizontal_table"));
    },
  );
});

test("parseWorkbookBundle parses side-by-side table blocks in one sheet", async () => {
  await withTempWorkbook(
    "side-by-side.xlsx",
    [
      sparseRow({
        0: EXCEL_LABELS.physicalTableName,
        1: "table_one",
        8: EXCEL_LABELS.physicalTableName,
        9: "table_two",
      }),
      sparseRow({
        0: EXCEL_LABELS.logicalTableName,
        1: "Table One",
        8: EXCEL_LABELS.logicalTableName,
        9: "Table Two",
      }),
      sparseRow({
        0: EXCEL_LABELS.no,
        1: EXCEL_LABELS.logicalName,
        2: EXCEL_LABELS.physicalName,
        3: EXCEL_LABELS.dataType,
        8: EXCEL_LABELS.no,
        9: EXCEL_LABELS.logicalName,
        10: EXCEL_LABELS.physicalName,
        11: EXCEL_LABELS.dataType,
      }),
      sparseRow({
        0: 1,
        1: "Id",
        2: "id",
        3: "int",
        8: 1,
        9: "Code",
        10: "code",
        11: "varchar",
      }),
    ],
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.ok(tables.length >= 1);
      assert.ok(
        tables.some(
          (table) => table.physicalTableName === "table_one" || table.physicalTableName === "table_two",
        ),
      );
    },
  );
});
