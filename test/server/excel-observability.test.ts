import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseWorkbookBundle } from "../../server/lib/excel";

async function withTempFile<T>(
  filename: string,
  rows: unknown[][],
  run: (filePath: string) => Promise<T>,
): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-observability-"));
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

test("parseWorkbookBundle exposes format detection traces for unknown sheets", async () => {
  await withTempFile(
    "unknown.xlsx",
    [
      ["random", "header"],
      ["value1", "value2"],
    ],
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      assert.equal(bundle.stats.sheetCount, 1);
      assert.ok(bundle.stats.detectedFormatCounts.UNKNOWN >= 1);
      assert.equal(bundle.stats.sheetParseTraces.length, 1);
      const trace = bundle.stats.sheetParseTraces[0];
      assert.equal(trace.sheetName, "Sheet1");
      assert.equal(trace.detectedFormat, "UNKNOWN");
      assert.ok(trace.reasons.length > 0);
      assert.ok(trace.strategySteps.length > 0);
    },
  );
});

test("parseWorkbookBundle traces include format-A signals when detected", async () => {
  await withTempFile(
    "format-a.xlsx",
    [
      ["\u30c6\u30fc\u30d6\u30eb\u60c5\u5831"],
      ["\u8ad6\u7406\u30c6\u30fc\u30d6\u30eb\u540d", "User"],
      ["\u7269\u7406\u30c6\u30fc\u30d6\u30eb\u540d", "user_table"],
      [],
      ["No", "\u8ad6\u7406\u540d", "\u7269\u7406\u540d", "\u30c7\u30fc\u30bf\u578b"],
      [1, "ID", "id", "bigint"],
    ],
    async (filePath) => {
      const bundle = parseWorkbookBundle(filePath);
      assert.equal(bundle.stats.sheetCount, 1);
      assert.ok(bundle.stats.detectedFormatCounts.A >= 1);
      const trace = bundle.stats.sheetParseTraces[0];
      assert.equal(trace.detectedFormat, "A");
      assert.ok(trace.confidence > 0);
      assert.ok(trace.scoreA >= trace.scoreB);
      assert.ok(trace.tableCount >= 1);
    },
  );
});
