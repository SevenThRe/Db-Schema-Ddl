import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { ExcelExecutor } from "../../server/lib/excel-executor";

async function withTempDir<T>(action: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-executor-test-"));
  try {
    return await action(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createWorkbookFile(filePath: string, sheetName: string): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["No", "\u8ad6\u7406\u540d", "\u7269\u7406\u540d", "\u30c7\u30fc\u30bf\u578b"],
    [1, "ID", "id", "bigint"],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);
}

test("ExcelExecutor cache applies TTL and LRU eviction", async () => {
  await withTempDir(async (tempDir) => {
    const fileA = path.join(tempDir, "a.xlsx");
    const fileB = path.join(tempDir, "b.xlsx");
    await createWorkbookFile(fileA, "SheetA");
    await createWorkbookFile(fileB, "SheetB");

    const executor = new ExcelExecutor({
      disabled: true,
      cacheTtlMs: 30,
      cacheMaxEntries: 1,
      cacheMaxTotalBytes: 10 * 1024 * 1024,
      cacheMaxBundleBytes: 10 * 1024 * 1024,
      queueMaxLength: 20,
    });

    try {
      const first = await executor.runParseWorkbookBundle(fileA);
      assert.equal(first.stats.cacheHit, false);

      const second = await executor.runParseWorkbookBundle(fileA);
      assert.equal(second.stats.cacheHit, true);

      await new Promise((resolve) => setTimeout(resolve, 50));
      const afterTtl = await executor.runParseWorkbookBundle(fileA);
      assert.equal(afterTtl.stats.cacheHit, false);

      await executor.runParseWorkbookBundle(fileA);
      await executor.runParseWorkbookBundle(fileB);
      const fileAAfterEviction = await executor.runParseWorkbookBundle(fileA);
      assert.equal(fileAAfterEviction.stats.cacheHit, false);

      const diagnostics = executor.getDiagnostics();
      assert.ok(diagnostics.metrics.cacheHits >= 1);
      assert.ok(diagnostics.metrics.cacheMisses >= 1);
      assert.ok(diagnostics.metrics.cacheEvictions >= 1);
      assert.ok(diagnostics.cacheEntries <= 1);
    } finally {
      await executor.shutdown();
    }
  });
});

test("ExcelExecutor restarts worker after timeout and continues processing", async () => {
  await withTempDir(async (tempDir) => {
    const workerPath = path.join(tempDir, "mock-worker.cjs");
    const workerScript = `
      const { parentPort } = require("worker_threads");
      let blocked = false;
      parentPort.on("message", (msg) => {
        if (blocked) {
          return;
        }
        if (msg && msg.payload && msg.payload.filePath === "__hang__") {
          blocked = true;
          return;
        }
        parentPort.postMessage({
          id: msg.id,
          ok: true,
          result: ["Sheet1"],
        });
      });
    `;
    await fs.writeFile(workerPath, workerScript, "utf8");

    const executor = new ExcelExecutor({
      timeoutMs: 100,
      poolSize: 1,
      workerScriptPath: workerPath,
      cacheMaxEntries: 0,
      queueMaxLength: 20,
    });

    try {
      await assert.rejects(
        () => executor.runListSheets("__hang__"),
        /timed out/i,
      );

      await new Promise((resolve) => setTimeout(resolve, 160));

      let sheets: string[] | undefined;
      const recoveryDeadline = Date.now() + 2_500;
      while (!sheets) {
        try {
          sheets = await executor.runListSheets("__ok__");
        } catch (error) {
          if (!/timed out/i.test(String(error)) || Date.now() >= recoveryDeadline) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }

      assert.deepEqual(sheets, ["Sheet1"]);

      const diagnostics = executor.getDiagnostics();
      assert.ok(diagnostics.metrics.workerTimeouts >= 1);
      assert.ok(diagnostics.metrics.workerRestarts >= 1);
    } finally {
      await executor.shutdown();
    }
  });
});
