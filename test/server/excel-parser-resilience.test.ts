import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { detectExcelFormat, parseWorkbookBundle } from "../../server/lib/excel";

const LABEL_TABLE_INFO = "\u30c6\u30fc\u30d6\u30eb\u60c5\u5831"; // テーブル情報
const LABEL_LOGICAL_TABLE = "\u8ad6\u7406\u30c6\u30fc\u30d6\u30eb\u540d"; // 論理テーブル名
const LABEL_PHYSICAL_TABLE = "\u7269\u7406\u30c6\u30fc\u30d6\u30eb\u540d"; // 物理テーブル名
const LABEL_LOGICAL = "\u8ad6\u7406\u540d"; // 論理名
const LABEL_PHYSICAL = "\u7269\u7406\u540d"; // 物理名
const LABEL_DATA_TYPE = "\u30c7\u30fc\u30bf\u578b"; // データ型
const LABEL_DB_BOOK = "\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9\u5b9a\u7fa9\u66f8"; // データベース定義書

async function withTempFile<T>(name: string, action: (filePath: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-parser-resilience-"));
  const filePath = path.join(tempDir, name);
  try {
    return await action(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("detectExcelFormat identifies format B by title and table header signature", () => {
  const data: string[][] = [
    [LABEL_DB_BOOK],
    ["No.", LABEL_LOGICAL_TABLE, LABEL_PHYSICAL_TABLE, "\u8aac\u660e"], // 説明
    ["1", "A", "a"],
  ];

  const result = detectExcelFormat(data);
  assert.equal(result.format, "B");
  assert.ok(result.confidence > 0.5);
  assert.ok(result.scoreB > result.scoreA);
});

test("parseWorkbookBundle handles normalized headers and non-numeric No values", async () => {
  await withTempFile("header-normalize.xlsx", async (filePath) => {
    const rows: Array<Array<string | number>> = [
      [LABEL_TABLE_INFO],
      [LABEL_LOGICAL_TABLE, "User Logical"],
      [LABEL_PHYSICAL_TABLE, "user_table"],
      [],
      ["\uff2e\uff4f", `${LABEL_LOGICAL} `, `${LABEL_PHYSICAL}\t`, `${LABEL_DATA_TYPE}\n`, "NOTNULL", "PK"],
      ["A-01", "User Id", "user_id", "bigint", "\u3007", "\u3007"],
      ["B-02", "User Name", "user_name", "varchar", "0", ""],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, filePath);

    const bundle = parseWorkbookBundle(filePath);
    const table = bundle.tablesBySheet.Sheet1?.[0];
    assert.ok(table, "expected one parsed table");
    assert.equal(table.columns.length, 2);
    assert.equal(table.columns[0].physicalName, "user_id");
    assert.equal(table.columns[0].no, undefined);
    assert.equal(table.columns[0].notNull, true);
    assert.equal(table.columns[0].isPk, true);
    assert.equal(table.columns[1].notNull, false);
  });
});

