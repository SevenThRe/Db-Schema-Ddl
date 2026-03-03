import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  ExcelExecutor,
  ExcelExecutorQueueOverflowError,
  clearExcelExecutorBundleCache,
  getExcelExecutorDiagnostics,
  runBuildSearchIndex,
  runListSheets,
  runParseRegion,
  runParseTables,
  runParseWorkbookBundle,
  shutdownExcelExecutor,
} from "../../server/lib/excel-executor";

async function withTempDir<T>(action: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "excel-executor-coverage-"));
  try {
    return await action(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createWorkbookFile(filePath: string, sheetName: string): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["No", "\u8ad6\u7406\u30c6\u30fc\u30d6\u30eb\u540d", "User"],
    ["\u7269\u7406\u30c6\u30fc\u30d6\u30eb\u540d", "user_table"],
    [],
    ["No", "\u8ad6\u7406\u540d", "\u7269\u7406\u540d", "\u30c7\u30fc\u30bf\u578b"],
    [1, "ID", "id", "bigint"],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);
}

test("ExcelExecutor rejects new tasks when queue length reaches configured limit", async () => {
  await withTempDir(async (tempDir) => {
    const workerPath = path.join(tempDir, "queue-worker.cjs");
    await fs.writeFile(
      workerPath,
      `
      const { parentPort } = require("worker_threads");
      parentPort.on("message", (msg) => {
        const wait = msg?.payload?.filePath === "__slow__" ? 150 : 10;
        setTimeout(() => {
          parentPort.postMessage({ id: msg.id, ok: true, result: ["Sheet1"] });
        }, wait);
      });
      `,
      "utf8",
    );

    const executor = new ExcelExecutor({
      timeoutMs: 1000,
      poolSize: 1,
      workerScriptPath: workerPath,
      queueMaxLength: 1,
      cacheMaxEntries: 0,
    });

    try {
      const first = executor.runListSheets("__slow__");
      const second = executor.runListSheets("__slow__");

      await assert.rejects(
        () => executor.runListSheets("__overflow__"),
        (error) => {
          assert.ok(error instanceof ExcelExecutorQueueOverflowError);
          assert.equal(error.code, "EXCEL_EXECUTOR_QUEUE_OVERFLOW");
          assert.match(error.message, /queue limit reached/i);
          return true;
        },
      );

      assert.deepEqual(await first, ["Sheet1"]);
      assert.deepEqual(await second, ["Sheet1"]);
    } finally {
      await executor.shutdown();
    }
  });
});

test("ExcelExecutorQueueOverflowError exposes default code and message", () => {
  const error = new ExcelExecutorQueueOverflowError();
  assert.equal(error.name, "ExcelExecutorQueueOverflowError");
  assert.equal(error.code, "EXCEL_EXECUTOR_QUEUE_OVERFLOW");
  assert.match(error.message, /queue is full/i);
});

test("ExcelExecutor disabled fallback covers parse operations and unsupported fallback task", async () => {
  await withTempDir(async (tempDir) => {
    const filePath = path.join(tempDir, "fallback.xlsx");
    await createWorkbookFile(filePath, "Sheet1");

    const executor = new ExcelExecutor({
      disabled: true,
      cacheMaxEntries: 0,
      queueMaxLength: 2,
    });

    try {
      const sheets = await executor.runListSheets(filePath);
      assert.deepEqual(sheets, ["Sheet1"]);

      const tables = await executor.runParseTables(filePath, "Sheet1");
      assert.equal(tables.length, 1);
      assert.equal(tables[0].physicalTableName, "user_table");

      const regionTables = await executor.runParseRegion(filePath, "Sheet1", 3, 10, 0, 3);
      assert.equal(regionTables.length, 1);
      assert.equal(regionTables[0].columns[0].physicalName, "id");

      const searchIndex = await executor.runBuildSearchIndex(filePath);
      assert.ok(searchIndex.some((item) => item.type === "sheet" && item.sheetName === "Sheet1"));
      assert.ok(searchIndex.some((item) => item.type === "table" && item.physicalTableName === "user_table"));

      await assert.rejects(
        () => (executor as unknown as { runFallbackTask: (type: string, payload: object) => Promise<unknown> })
          .runFallbackTask("unsupported_type", {}),
        /Unsupported fallback task type/i,
      );
    } finally {
      await executor.shutdown();
    }
  });
});

test("ExcelExecutor runParseWorkbookBundle propagates missing-file errors", async () => {
  const executor = new ExcelExecutor({
    disabled: true,
    cacheMaxEntries: 1,
    queueMaxLength: 2,
  });

  try {
    await assert.rejects(
      () => executor.runParseWorkbookBundle("__missing_file__.xlsx"),
      /ENOENT|no such file|not found/i,
    );
    const diagnostics = executor.getDiagnostics();
    assert.ok(diagnostics.metrics.cacheMisses >= 1);
  } finally {
    await executor.shutdown();
  }
});

test("module-level excel executor APIs initialize, expose diagnostics, and shutdown idempotently", async () => {
  await withTempDir(async (tempDir) => {
    const filePath = path.join(tempDir, "module-api.xlsx");
    await createWorkbookFile(filePath, "Sheet1");

    const previousDisabled = process.env.EXCEL_WORKER_DISABLED;
    process.env.EXCEL_WORKER_DISABLED = "true";

    try {
      await shutdownExcelExecutor();

      const sheets = await runListSheets(filePath);
      assert.deepEqual(sheets, ["Sheet1"]);

      const tables = await runParseTables(filePath, "Sheet1");
      assert.equal(tables.length, 1);

      const regionTables = await runParseRegion(filePath, "Sheet1", 3, 10, 0, 3);
      assert.equal(regionTables.length, 1);

      const bundle = await runParseWorkbookBundle(filePath, undefined, "fixed-hash");
      assert.equal(bundle.stats.cacheHit, false);

      const searchIndex = await runBuildSearchIndex(filePath);
      assert.ok(searchIndex.length >= 2);

      const diagnostics = getExcelExecutorDiagnostics();
      assert.equal(diagnostics.disabled, true);
      assert.ok(diagnostics.cacheEntries >= 0);
      assert.ok(diagnostics.metrics.cacheHits >= 0);

      clearExcelExecutorBundleCache();
      await shutdownExcelExecutor();
      await shutdownExcelExecutor();
    } finally {
      if (previousDisabled == null) {
        delete process.env.EXCEL_WORKER_DISABLED;
      } else {
        process.env.EXCEL_WORKER_DISABLED = previousDisabled;
      }
      await shutdownExcelExecutor();
    }
  });
});

test("ExcelExecutor reads runtime knobs from environment when overrides are omitted", async () => {
  const previous = {
    ELECTRON_MODE: process.env.ELECTRON_MODE,
    EXCEL_WORKER_DISABLED: process.env.EXCEL_WORKER_DISABLED,
    EXCEL_WORKER_POOL_SIZE: process.env.EXCEL_WORKER_POOL_SIZE,
    EXCEL_WORKER_TIMEOUT_MS: process.env.EXCEL_WORKER_TIMEOUT_MS,
    EXCEL_CACHE_TTL_MS: process.env.EXCEL_CACHE_TTL_MS,
    EXCEL_CACHE_MAX_ENTRIES_ELECTRON: process.env.EXCEL_CACHE_MAX_ENTRIES_ELECTRON,
    EXCEL_CACHE_MAX_TOTAL_MB_ELECTRON: process.env.EXCEL_CACHE_MAX_TOTAL_MB_ELECTRON,
    EXCEL_CACHE_MAX_BUNDLE_MB_ELECTRON: process.env.EXCEL_CACHE_MAX_BUNDLE_MB_ELECTRON,
    EXCEL_EXECUTOR_QUEUE_MAX: process.env.EXCEL_EXECUTOR_QUEUE_MAX,
  };

  process.env.ELECTRON_MODE = "true";
  process.env.EXCEL_WORKER_DISABLED = "true";
  process.env.EXCEL_WORKER_POOL_SIZE = "2";
  process.env.EXCEL_WORKER_TIMEOUT_MS = "1500";
  process.env.EXCEL_CACHE_TTL_MS = "2500";
  process.env.EXCEL_CACHE_MAX_ENTRIES_ELECTRON = "7";
  process.env.EXCEL_CACHE_MAX_TOTAL_MB_ELECTRON = "1.5";
  process.env.EXCEL_CACHE_MAX_BUNDLE_MB_ELECTRON = "0.5";
  process.env.EXCEL_EXECUTOR_QUEUE_MAX = "11";

  const executor = new ExcelExecutor();
  try {
    const diagnostics = executor.getDiagnostics();
    assert.equal(diagnostics.disabled, true);
    assert.equal(diagnostics.timeoutMs, 1500);
    assert.equal(diagnostics.cacheTtlMs, 2500);
    assert.equal(diagnostics.cacheMaxEntries, 7);
    assert.equal(diagnostics.cacheMaxTotalBytes, Math.floor(1.5 * 1024 * 1024));
    assert.equal(diagnostics.cacheMaxBundleBytes, Math.floor(0.5 * 1024 * 1024));
    assert.equal(diagnostics.queueMaxLength, 11);
    assert.equal(diagnostics.workerCount, 0);
  } finally {
    await executor.shutdown();
    Object.entries(previous).forEach(([key, value]) => {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("ExcelExecutor shutdown rejects queued/in-flight tasks and future enqueue calls", async () => {
  await withTempDir(async (tempDir) => {
    const workerPath = path.join(tempDir, "shutdown-worker.cjs");
    await fs.writeFile(
      workerPath,
      `
      const { parentPort } = require("worker_threads");
      parentPort.on("message", (msg) => {
        setTimeout(() => {
          parentPort.postMessage({ id: msg.id, ok: true, result: ["late"] });
        }, 5000);
      });
      `,
      "utf8",
    );

    const executor = new ExcelExecutor({
      timeoutMs: 10_000,
      poolSize: 1,
      workerScriptPath: workerPath,
      queueMaxLength: 4,
      cacheMaxEntries: 0,
    });

    const inFlightTask = executor.runListSheets("__slow_1__").then(
      () => null,
      (error) => error as Error,
    );
    const queuedTask = executor.runListSheets("__slow_2__").then(
      () => null,
      (error) => error as Error,
    );
    await executor.shutdown();

    const inFlightError = await inFlightTask;
    const queuedError = await queuedTask;
    assert.match(inFlightError?.message ?? "", /shutting down/i);
    assert.match(queuedError?.message ?? "", /shutting down/i);
    await assert.rejects(() => executor.runListSheets("__late__"), /shutting down/i);
  });
});

test("ExcelExecutor falls back to server defaults when environment values are invalid", async () => {
  const previous = {
    ELECTRON_MODE: process.env.ELECTRON_MODE,
    EXCEL_WORKER_DISABLED: process.env.EXCEL_WORKER_DISABLED,
    EXCEL_WORKER_POOL_SIZE: process.env.EXCEL_WORKER_POOL_SIZE,
    EXCEL_WORKER_TIMEOUT_MS: process.env.EXCEL_WORKER_TIMEOUT_MS,
    EXCEL_CACHE_TTL_MS: process.env.EXCEL_CACHE_TTL_MS,
    EXCEL_CACHE_MAX_ENTRIES_SERVER: process.env.EXCEL_CACHE_MAX_ENTRIES_SERVER,
    EXCEL_CACHE_MAX_TOTAL_MB_SERVER: process.env.EXCEL_CACHE_MAX_TOTAL_MB_SERVER,
    EXCEL_CACHE_MAX_BUNDLE_MB_SERVER: process.env.EXCEL_CACHE_MAX_BUNDLE_MB_SERVER,
    EXCEL_EXECUTOR_QUEUE_MAX: process.env.EXCEL_EXECUTOR_QUEUE_MAX,
  };

  process.env.ELECTRON_MODE = "false";
  process.env.EXCEL_WORKER_DISABLED = "true";
  process.env.EXCEL_WORKER_POOL_SIZE = "0";
  process.env.EXCEL_WORKER_TIMEOUT_MS = "10";
  process.env.EXCEL_CACHE_TTL_MS = "10";
  process.env.EXCEL_CACHE_MAX_ENTRIES_SERVER = "0";
  process.env.EXCEL_CACHE_MAX_TOTAL_MB_SERVER = "-1";
  process.env.EXCEL_CACHE_MAX_BUNDLE_MB_SERVER = "not-a-number";
  process.env.EXCEL_EXECUTOR_QUEUE_MAX = "0";

  const executor = new ExcelExecutor();
  try {
    const diagnostics = executor.getDiagnostics();
    assert.equal(diagnostics.disabled, true);
    assert.equal(diagnostics.timeoutMs, 120000);
    assert.equal(diagnostics.cacheTtlMs, 10 * 60 * 1000);
    assert.equal(diagnostics.cacheMaxEntries, 20);
    assert.equal(diagnostics.cacheMaxTotalBytes, 160 * 1024 * 1024);
    assert.equal(diagnostics.cacheMaxBundleBytes, 24 * 1024 * 1024);
    assert.equal(diagnostics.queueMaxLength, 200);
  } finally {
    await executor.shutdown();
    Object.entries(previous).forEach(([key, value]) => {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("ExcelExecutor restarts worker after runtime worker error event", async () => {
  await withTempDir(async (tempDir) => {
    const workerPath = path.join(tempDir, "error-worker.cjs");
    await fs.writeFile(
      workerPath,
      `
      const { parentPort } = require("worker_threads");
      parentPort.on("message", (msg) => {
        if (msg && msg.payload && msg.payload.filePath === "__boom__") {
          throw new Error("worker-boom");
        }
        parentPort.postMessage({ id: msg.id, ok: true, result: ["Sheet1"] });
      });
      `,
      "utf8",
    );

    const executor = new ExcelExecutor({
      timeoutMs: 1000,
      poolSize: 1,
      workerScriptPath: workerPath,
      queueMaxLength: 4,
      cacheMaxEntries: 0,
    });

    try {
      await assert.rejects(() => executor.runListSheets("__boom__"), /worker-boom/i);
      await new Promise((resolve) => setTimeout(resolve, 120));
      const sheets = await executor.runListSheets("__ok__");
      assert.deepEqual(sheets, ["Sheet1"]);

      const diagnostics = executor.getDiagnostics();
      assert.ok(diagnostics.metrics.workerRestarts >= 1);
    } finally {
      await executor.shutdown();
    }
  });
});
