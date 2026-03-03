import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseSheetRegion, parseTableDefinitions, parseWorkbookBundle } from "../../server/lib/excel";
import { EXCEL_PARSER_FALLBACKS } from "../../server/constants/excel-parser";
import { EXCEL_LABELS } from "../../server/constants/excel-parser";

type SheetRows = Record<string, unknown[][]>;

async function withTempWorkbook<T>(
  filename: string,
  sheets: SheetRows,
  run: (filePath: string) => Promise<T> | T,
): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-whitebox-"));
  const filePath = path.join(tempDir, filename);
  try {
    const workbook = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([sheetName, rows]) => {
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });
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

test("parseSheetRegion uses deterministic fallback table names for normalized sheet segments", async () => {
  const rows = [
    [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType],
    [1, "Id", "id", "bigint"],
  ];

  await withTempWorkbook(
    "sheet-name-fallback.xlsx",
    {
      "###": rows,
      "123Start": rows,
    },
    async (filePath) => {
      const symbolSheet = parseSheetRegion(filePath, "###", 0, 10, 0, 3);
      assert.equal(symbolSheet.length, 1);
      assert.equal(symbolSheet[0].logicalTableName, "###");
      assert.equal(symbolSheet[0].physicalTableName, "region_sheet_r1_c1");

      const numericSheet = parseSheetRegion(filePath, "123Start", 0, 10, 0, 3);
      assert.equal(numericSheet.length, 1);
      assert.equal(numericSheet[0].logicalTableName, "123Start");
      assert.equal(numericSheet[0].physicalTableName, "region_s_123_start_r1_c1");
    },
  );
});

test("parseSheetRegion resolves label values from next-row preferred and scan fallback positions", async () => {
  await withTempWorkbook(
    "resolve-label-value-fallbacks.xlsx",
    {
      Sheet1: [
        sparseRow({
          3: EXCEL_LABELS.logicalTableName,
          5: EXCEL_LABELS.physicalTableName,
        }),
        sparseRow({
          0: "Resolved By Scan",
          5: "resolved_by_preferred_col",
        }),
        [],
        sparseRow({
          0: EXCEL_LABELS.no,
          1: EXCEL_LABELS.logicalName,
          2: EXCEL_LABELS.physicalName,
          3: EXCEL_LABELS.dataType,
        }),
        sparseRow({
          0: 1,
          1: "Id",
          2: "id",
          3: "int",
        }),
      ],
    },
    async (filePath) => {
      const tables = parseSheetRegion(filePath, "Sheet1", 3, 10, 0, 6);
      assert.equal(tables.length, 1);
      assert.equal(tables[0].logicalTableName, "Resolved By Scan");
      assert.equal(tables[0].physicalTableName, "resolved_by_preferred_col");
      assert.equal(tables[0].sourceRef?.logicalName?.address, "A2");
      assert.equal(tables[0].sourceRef?.physicalName?.address, "F2");
    },
  );
});

test("parseWorkbookBundle skips metadata and repeated headers while honoring aliases and option parsing", async () => {
  await withTempWorkbook(
    "column-parser-branches.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.tableInfo],
        [EXCEL_LABELS.logicalTableName, "Meta Table"],
        [EXCEL_LABELS.physicalTableName, "meta_table"],
        [],
        [
          EXCEL_LABELS.noDot,
          EXCEL_LABELS.logicalName,
          EXCEL_LABELS.physicalName,
          EXCEL_LABELS.dataType,
          EXCEL_LABELS.sizeAlt,
          "NOT NULL",
          "\u4e3b\u30ad\u30fc",
          EXCEL_LABELS.remarks,
        ],
        [1, "RDBMS", "MySQL", "varchar", "", "", "", "meta row"],
        [
          EXCEL_LABELS.no,
          EXCEL_LABELS.logicalName,
          EXCEL_LABELS.physicalName,
          EXCEL_LABELS.dataType,
          EXCEL_LABELS.size,
          EXCEL_LABELS.notNull,
          EXCEL_LABELS.pk,
        ],
        ["X-1", "Missing Physical", "", "varchar", "20", "required", "Y"],
        ["", "", "", "", "", "", ""],
        [2, "Name", "name", "varchar", "40", "required", "Y", "\u30b3\u30fc\u30c9\u30de\u30b9\u30bf STATUS (A:Active,B:Blocked)"],
        [3, "Deleted At", "deleted_at", "datetime", "", "-", "", "normal"],
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath, { pkMarkers: ["Y"] });
      const table = bundle.tablesBySheet.Sheet1?.[0];
      assert.ok(table, "expected one table");
      assert.equal(table.columns.length, 2);

      const [nameColumn, deletedColumn] = table.columns;
      assert.equal(nameColumn.physicalName, "name");
      assert.equal(nameColumn.notNull, true);
      assert.equal(nameColumn.isPk, true);
      assert.equal(nameColumn.size, "40");

      assert.ok(nameColumn.codeReferences);
      assert.equal(nameColumn.codeReferences.length, 1);
      assert.equal(nameColumn.codeReferences[0].codeId, "STATUS");
      assert.equal(nameColumn.codeReferences[0].options?.length, 2);
      assert.deepEqual(nameColumn.codeReferences[0].options?.map((option) => option.code), ["A", "B"]);

      assert.equal(deletedColumn.physicalName, "deleted_at");
      assert.equal(deletedColumn.notNull, false);
      assert.equal(deletedColumn.isPk, false);
    },
  );
});

test("parseWorkbookBundle supports zero-width reference extraction and ignores invalid rules", async () => {
  await withTempWorkbook(
    "reference-extraction-rules.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.tableInfo],
        [EXCEL_LABELS.logicalTableName, "Rule Test"],
        [EXCEL_LABELS.physicalTableName, "rule_test"],
        [],
        [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType, EXCEL_LABELS.remarks],
        [1, "Code", "code", "varchar", "CODE1 CODE2 CODE1"],
      ],
    },
    async (filePath) => {
      const customBundle = parseWorkbookBundle(filePath, {
        referenceExtraction: {
          enabled: true,
          rules: [
            { source: "custom", pattern: "(?=(CODE\\d))", flags: "g", codeIdGroup: 1 },
            { source: "invalid-flags", pattern: "(CODE\\d)", flags: "z", codeIdGroup: 1 },
            { source: "invalid-code-group", pattern: "(CODE\\d)", flags: "g", codeIdGroup: 0 },
            { source: "invalid-options-group", pattern: "(CODE\\d)", flags: "g", codeIdGroup: 1, optionsGroup: 0 },
            { source: "too-long", pattern: "A".repeat(1001), flags: "g", codeIdGroup: 1 },
          ],
        },
      });
      const column = customBundle.tablesBySheet.Sheet1?.[0]?.columns[0];
      assert.ok(column, "expected one parsed column");
      assert.ok(column.codeReferences);
      assert.deepEqual(column.codeReferences.map((ref) => ref.codeId), ["CODE1", "CODE2"]);
      assert.ok(column.codeReferences.every((ref) => ref.source === "custom"));
      assert.ok(column.codeReferences.every((ref) => ref.raw.includes("CODE")));

      const disabledBundle = parseWorkbookBundle(filePath, {
        referenceExtraction: {
          enabled: false,
          rules: [{ source: "custom", pattern: "(CODE\\d)", flags: "g", codeIdGroup: 1 }],
        },
      });
      const disabledColumn = disabledBundle.tablesBySheet.Sheet1?.[0]?.columns[0];
      assert.ok(disabledColumn, "expected one parsed column for disabled extraction run");
      assert.equal(disabledColumn.codeReferences, undefined);
    },
  );
});

test("parseWorkbookBundle parses side-by-side tables whose physical names are provided on the next row", async () => {
  await withTempWorkbook(
    "side-by-side-physical-name-next-row.xlsx",
    {
      Sheet1: [
        sparseRow({
          0: EXCEL_LABELS.physicalTableName,
          8: EXCEL_LABELS.physicalTableName,
        }),
        sparseRow({
          0: "table_a",
          8: "table_b",
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
          1: "A Id",
          2: "a_id",
          3: "int",
          8: 1,
          9: "B Id",
          10: "b_id",
          11: "int",
        }),
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.ok(tables.length >= 1);

      const table = tables[0];
      assert.equal(table.logicalTableName, "table_a");
      assert.equal(table.physicalTableName, "table_a");
      assert.equal(table.sourceRef?.physicalName?.address, "A2");
    },
  );
});

test("parseTableDefinitions legacy scanner skips table blocks without a valid header and continues", async () => {
  await withTempWorkbook(
    "legacy-scan-skip-invalid-block.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.logicalTableName, "First"],
        [EXCEL_LABELS.physicalTableName, "first_table"],
        ["header", "missing", "required", "columns"],
        [EXCEL_LABELS.logicalTableName, "Second"],
        [EXCEL_LABELS.physicalTableName, "second_table"],
        [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType],
        [1, "Id", "id", "int"],
      ],
    },
    async (filePath) => {
      const tables = parseTableDefinitions(filePath, "Sheet1");
      assert.equal(tables.length, 1);
      assert.equal(tables[0].logicalTableName, "Second");
      assert.equal(tables[0].physicalTableName, "second_table");
    },
  );
});

test("parseWorkbookBundle detected-format B can fall back to format-A strategy when format-B extractors return no tables", async () => {
  await withTempWorkbook(
    "format-b-to-format-a-fallback.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.databaseDefinition],
        [EXCEL_LABELS.tableInfo],
        [EXCEL_LABELS.logicalTableName, "Fallback A"],
        [EXCEL_LABELS.physicalTableName, "fallback_a_table"],
        [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType],
        [1, "Id", "id", "bigint"],
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const table = bundle.tablesBySheet.Sheet1?.[0];
      assert.ok(table);
      assert.equal(table.physicalTableName, "fallback_a_table");

      const trace = bundle.stats.sheetParseTraces[0];
      assert.equal(trace.detectedFormat, "B");
      assert.ok(trace.strategySteps.includes("format_b_vertical"));
      assert.ok(trace.strategySteps.includes("format_a_block"));
    },
  );
});

test("parseWorkbookBundle format-B vertical scanner skips empty-name or header-missing blocks and keeps later valid tables", async () => {
  await withTempWorkbook(
    "format-b-vertical-skip-branches.xlsx",
    {
      Sheet1: [
        sparseRow({
          0: EXCEL_LABELS.databaseDefinition,
          20: EXCEL_LABELS.tableInfo,
        }),
        [EXCEL_LABELS.noDot, EXCEL_LABELS.logicalTableName, EXCEL_LABELS.physicalTableName],
        [1, "", ""],
        [EXCEL_LABELS.noDot, EXCEL_LABELS.logicalTableName, EXCEL_LABELS.physicalTableName],
        [2, "NoColumnHeader", "no_column_header"],
        [],
        sparseRow({
          20: EXCEL_LABELS.logicalTableName,
          21: "Valid",
        }),
        sparseRow({
          20: EXCEL_LABELS.physicalTableName,
          21: "valid_table",
        }),
        sparseRow({
          20: EXCEL_LABELS.no,
          21: EXCEL_LABELS.logicalName,
          22: EXCEL_LABELS.physicalName,
          23: EXCEL_LABELS.dataType,
        }),
        sparseRow({
          20: 1,
          21: "Id",
          22: "id",
          23: "int",
        }),
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.equal(tables.length, 1);
      assert.equal(tables[0].physicalTableName, "valid_table");
      assert.ok(!tables.some((table) => table.physicalTableName === "no_column_header"));
    },
  );
});

test("parseWorkbookBundle side-by-side parser tolerates missing physical table names and uses configured fallback", async () => {
  await withTempWorkbook(
    "side-by-side-missing-physical-name.xlsx",
    {
      Sheet1: [
        sparseRow({
          0: EXCEL_LABELS.physicalTableName,
          8: EXCEL_LABELS.physicalTableName,
        }),
        sparseRow({
          1: "",
          9: "",
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
          1: "A Id",
          2: "a_id",
          3: "int",
          8: 1,
          9: "B Id",
          10: "b_id",
          11: "int",
        }),
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.ok(tables.length >= 1);
      assert.equal(tables[0].physicalTableName, EXCEL_PARSER_FALLBACKS.unknownPhysicalTableName);
      assert.equal(tables[0].sourceRef?.physicalName, undefined);
    },
  );
});

test("parseWorkbookBundle falls back to default PK markers and skips repeated-header or empty-physical rows", async () => {
  await withTempWorkbook(
    "pk-marker-fallback-and-row-filtering.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.tableInfo],
        [EXCEL_LABELS.logicalTableName, "PkMarkerTable"],
        [EXCEL_LABELS.physicalTableName, "pk_marker_table"],
        [],
        [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType, EXCEL_LABELS.pk],
        [1, "Id", "id", "bigint", "\u3007"],
        ["", EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType, EXCEL_LABELS.pk],
        [2, "OnlyLogical", "", "varchar", ""],
        ["", "", "", "", ""],
        [3, "Name", "name", "varchar", ""],
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath, {
        pkMarkers: ["   ", ""],
      });
      const table = bundle.tablesBySheet.Sheet1?.[0];
      assert.ok(table);
      assert.equal(table.columns.length, 2);
      assert.equal(table.columns[0].physicalName, "id");
      assert.equal(table.columns[0].isPk, true);
      assert.equal(table.columns[1].physicalName, "name");
    },
  );
});

test("parseWorkbookBundle ignores side-by-side candidates that never provide a column header row", async () => {
  await withTempWorkbook(
    "side-by-side-without-column-headers.xlsx",
    {
      Sheet1: [
        sparseRow({
          0: EXCEL_LABELS.physicalTableName,
          1: "table_a",
          8: EXCEL_LABELS.physicalTableName,
          9: "table_b",
        }),
        sparseRow({
          0: "not",
          1: "a",
          2: "header",
          8: "not",
          9: "a",
          10: "header",
        }),
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.equal(tables.length, 0);
    },
  );
});

test("parseWorkbookBundle limits extracted code references per comment to the configured cap", async () => {
  const repeatedRefs = Array.from({ length: 260 }, (_, index) => `\u30b3\u30fc\u30c9\u30de\u30b9\u30bf CODE${index}`)
    .join(" ");

  await withTempWorkbook(
    "reference-cap.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.tableInfo],
        [EXCEL_LABELS.logicalTableName, "CodeRefCap"],
        [EXCEL_LABELS.physicalTableName, "code_ref_cap"],
        [],
        [EXCEL_LABELS.no, EXCEL_LABELS.logicalName, EXCEL_LABELS.physicalName, EXCEL_LABELS.dataType, EXCEL_LABELS.remarks],
        [1, "Code", "code", "varchar", repeatedRefs],
      ],
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const column = bundle.tablesBySheet.Sheet1?.[0]?.columns[0];
      assert.ok(column);
      assert.ok(column.codeReferences);
      assert.equal(column.codeReferences.length, 200);
      assert.equal(column.codeReferences[0].codeId, "CODE0");
    },
  );
});

test("parseWorkbookBundle side-by-side strategy handles same-row table names and non-standard header boundaries", async () => {
  await withTempWorkbook(
    "side-by-side-header-boundary.xlsx",
    {
      Sheet1: [
        [EXCEL_LABELS.databaseDefinition],
        sparseRow({
          0: EXCEL_LABELS.physicalTableName,
          1: "table_a",
          8: EXCEL_LABELS.physicalTableName,
          9: "table_b",
        }),
        sparseRow({
          0: EXCEL_LABELS.logicalTableName,
          1: "Table A",
          8: EXCEL_LABELS.logicalTableName,
          9: "Table B",
        }),
        sparseRow({
          0: EXCEL_LABELS.no,
          1: EXCEL_LABELS.logicalName,
          2: EXCEL_LABELS.physicalName,
          3: EXCEL_LABELS.dataType,
          4: "STOP",
          8: EXCEL_LABELS.no,
          9: EXCEL_LABELS.logicalName,
          10: EXCEL_LABELS.physicalName,
          11: EXCEL_LABELS.dataType,
          12: "STOP",
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
    },
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      const tables = bundle.tablesBySheet.Sheet1 ?? [];
      assert.ok(tables.length >= 1);

      const tableA = tables.find((table) => table.physicalTableName === "table_a");
      assert.ok(tableA);
      assert.equal(tableA.sourceRef?.physicalName?.address, "B2");
      assert.equal(tableA.columnRange?.endColLabel, "D");
    },
  );
});
