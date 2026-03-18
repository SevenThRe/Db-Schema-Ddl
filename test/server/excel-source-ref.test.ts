import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseWorkbookBundle } from "../../server/lib/excel";

const LABEL_TABLE_INFO = "\u30c6\u30fc\u30d6\u30eb\u60c5\u5831"; // テーブル情報
const LABEL_LOGICAL_TABLE = "\u8ad6\u7406\u30c6\u30fc\u30d6\u30eb\u540d"; // 論理テーブル名
const LABEL_PHYSICAL_TABLE = "\u7269\u7406\u30c6\u30fc\u30d6\u30eb\u540d"; // 物理テーブル名
const LABEL_LOGICAL = "\u8ad6\u7406\u540d"; // 論理名
const LABEL_PHYSICAL = "\u7269\u7406\u540d"; // 物理名
const LABEL_DATA_TYPE = "\u30c7\u30fc\u30bf\u578b"; // データ型
const LABEL_COMMENT = "\u5099\u8003"; // 備考

async function withTempFile<T>(name: string, action: (filePath: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-source-ref-test-"));
  const filePath = path.join(tempDir, name);
  try {
    return await action(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("parseWorkbookBundle provides sourceRef for table and column physical names in format A", async () => {
  await withTempFile("source-ref.xlsx", async (filePath) => {
    const rows: Array<Array<string | number>> = [
      [LABEL_TABLE_INFO],
      [LABEL_LOGICAL_TABLE, "User Logical"],
      [LABEL_PHYSICAL_TABLE, "User Table"],
      [],
      ["No", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE],
      [1, "User Id", "User ID", "varchar"],
      [2, "Group", "group", "varchar"],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, filePath);

    const bundle = parseWorkbookBundle(filePath);
    assert.ok(bundle.tablesBySheet.Sheet1);
    assert.equal(bundle.tablesBySheet.Sheet1.length, 1);

    const table = bundle.tablesBySheet.Sheet1[0];
    assert.equal(table.sourceRef?.physicalName?.sheetName, "Sheet1");
    assert.equal(table.sourceRef?.physicalName?.address, "B3");
    assert.equal(table.sourceRef?.physicalName?.row, 2);
    assert.equal(table.sourceRef?.physicalName?.col, 1);

    assert.equal(table.columns.length, 2);
    assert.equal(table.columns[0].sourceRef?.address, "C6");
    assert.equal(table.columns[0].sourceRef?.sheetName, "Sheet1");
    assert.equal(table.columns[1].sourceRef?.address, "C7");
  });
});

test("parseWorkbookBundle marks autoIncrement from comment/remarks text", async () => {
  await withTempFile("auto-increment-detect.xlsx", async (filePath) => {
    const rows: Array<Array<string | number>> = [
      [LABEL_TABLE_INFO],
      [LABEL_LOGICAL_TABLE, "Order Logical"],
      [LABEL_PHYSICAL_TABLE, "order_table"],
      [],
      ["No", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE, LABEL_COMMENT],
      [1, "Order Id", "order_id", "bigint", "Primary key AUTO_INCREMENT"],
      [2, "Created By", "created_by", "varchar", "normal column"],
      [3, "Seq", "seq_no", "int", "\u81ea\u52d5\u63a1\u756a"], // 自動採番
      [4, "Manual", "manual_no", "int", "not auto increment"],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, filePath);

    const bundle = parseWorkbookBundle(filePath);
    const table = bundle.tablesBySheet.Sheet1?.[0];
    assert.ok(table, "expected one parsed table");
    assert.equal(table.columns.length, 4);

    assert.equal(table.columns[0].autoIncrement, true);
    assert.equal(table.columns[1].autoIncrement, false);
    assert.equal(table.columns[2].autoIncrement, true);
    assert.equal(table.columns[3].autoIncrement, false);
  });
});

test("parseWorkbookBundle treats bigint(ai) style data types as auto increment markers", async () => {
  await withTempFile("auto-increment-datatype.xlsx", async (filePath) => {
    const rows: Array<Array<string | number>> = [
      [LABEL_TABLE_INFO],
      [LABEL_LOGICAL_TABLE, "Processing Conditions"],
      [LABEL_PHYSICAL_TABLE, "processing_conditions"],
      [],
      ["No", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE, "PK"],
      [1, "Condition Id", "conditionid", "bigint(ai)", "〇"],
      [2, "Condition Name", "condition_name", "varchar", ""],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, filePath);

    const bundle = parseWorkbookBundle(filePath);
    const table = bundle.tablesBySheet.Sheet1?.[0];
    assert.ok(table, "expected one parsed table");
    assert.equal(table.columns[0].dataType, "bigint");
    assert.equal(table.columns[0].size, undefined);
    assert.equal(table.columns[0].autoIncrement, true);
    assert.equal(table.columns[0].isPk, true);
  });
});

test("parseWorkbookBundle resolves table names when logical/physical labels are adjacent on same row", async () => {
  await withTempFile("adjacent-table-name-labels.xlsx", async (filePath) => {
    const rows: Array<Array<string | number>> = [
      [LABEL_LOGICAL_TABLE, LABEL_PHYSICAL_TABLE],
      ["\u7d66\u4e0e\u4f1a\u793e\u30de\u30b9\u30bf", "kuyou_kaisya_master"], // 給与会社マスタ
      [],
      ["No", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE],
      [1, "\u4f1a\u793eID", "company_id", "bigint"], // 会社ID
      [2, "\u4f1a\u793e\u540d", "company_name", "varchar"], // 会社名
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, filePath);

    const bundle = parseWorkbookBundle(filePath);
    const table = bundle.tablesBySheet.Sheet1?.[0];
    assert.ok(table, "expected one parsed table");

    assert.equal(table.logicalTableName, "\u7d66\u4e0e\u4f1a\u793e\u30de\u30b9\u30bf");
    assert.equal(table.physicalTableName, "kuyou_kaisya_master");
    assert.equal(table.sourceRef?.logicalName?.address, "A2");
    assert.equal(table.sourceRef?.physicalName?.address, "B2");
    assert.equal(table.columns.length, 2);
  });
});
