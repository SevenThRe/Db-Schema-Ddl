import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { assertValidExcelFile, ExcelValidationError, validateExcelFile } from "../../server/lib/excel-validation";

function withTempDir(run: (dir: string) => void) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excel-validation-"));
  try {
    run(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeWorkbook(filePath: string, rows: unknown[][]): void {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filePath);
}

test("validateExcelFile accepts a valid workbook", () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, "valid.xlsx");
    writeWorkbook(filePath, [
      ["No", "Logical", "Physical"],
      [1, "name", "tbl_name"],
    ]);

    const result = validateExcelFile(filePath, {
      maxFileSizeMb: 5,
      maxRowsPerSheet: 100,
    });

    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.sheetCount, 1);
  });
});

test("validateExcelFile rejects invalid extension", () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, "broken.txt");
    fs.writeFileSync(filePath, "not-a-real-excel-content", "utf8");

    const result = validateExcelFile(filePath, {
      maxFileSizeMb: 5,
      maxRowsPerSheet: 100,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "INVALID_EXTENSION"));
  });
});

test("validateExcelFile reports row-limit violation", () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, "rows.xlsx");
    writeWorkbook(filePath, [
      ["header"],
      ["row1"],
      ["row2"],
    ]);

    const result = validateExcelFile(filePath, {
      maxFileSizeMb: 5,
      maxRowsPerSheet: 2,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "SHEET_TOO_LARGE"));
  });
});

test("validateExcelFile reports missing file and assertValidExcelFile throws", () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, "missing.xlsx");

    const result = validateExcelFile(filePath, {
      maxFileSizeMb: 5,
      maxRowsPerSheet: 100,
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "FILE_NOT_FOUND"));

    assert.throws(
      () => assertValidExcelFile(filePath, { maxFileSizeMb: 5, maxRowsPerSheet: 100 }),
      (error) => {
        assert.ok(error instanceof ExcelValidationError);
        assert.match(error.message, /Excel validation failed/i);
        assert.ok(error.issues.some((issue) => issue.code === "FILE_NOT_FOUND"));
        return true;
      },
    );
  });
});

test("validateExcelFile reports file too large and invalid workbook payload", () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, "oversized.xlsx");
    fs.writeFileSync(filePath, Buffer.from("PK\x03\x04bad", "binary"));
    const result = validateExcelFile(filePath, {
      maxFileSizeMb: 0.000001,
      maxRowsPerSheet: 100,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "FILE_TOO_LARGE"));
    assert.ok(result.issues.some((issue) => issue.code === "INVALID_WORKBOOK"));
  });
});
