import test from "node:test";
import assert from "node:assert/strict";

import {
  createResultExportStateActions,
  runFinishResultExportRequestState,
  runStartResultExportRequestState,
  runWorkbenchResultExport,
} from "../../client/src/components/extensions/db-workbench/result-export-runner";
import type {
  BinaryCommandResult,
  DbQueryBatchResult,
  ExportRowsRequest,
} from "../../shared/schema";
import type { ToastOptions } from "../../client/src/extensions/host-api";

function batch(overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
  return {
    sql: "select id from users",
    columns: [{ name: "id", dataType: "integer" }],
    rows: [{ values: [1] }],
    totalRows: 1,
    returnedRows: 1,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 7,
    ...overrides,
  };
}

function exportResult(
  overrides: Partial<BinaryCommandResult> = {},
): BinaryCommandResult {
  return {
    fileName: "users.json",
    base64: "",
    mimeType: "application/json",
    successCount: 1,
    skippedCount: 0,
    skippedTables: [],
    ...overrides,
  };
}

test("result export runner blocks unsupported scopes before starting a request", async () => {
  let started = 0;
  const notices: ToastOptions[] = [];

  const result = await runWorkbenchResultExport({
    connectionId: "conn-1",
    results: { batches: [batch({ pagingMode: "none" })] },
    activeBatchIndex: 0,
    scope: "full_result",
    format: "json",
    isExecuting: false,
    isExporting: false,
    createRequestId: () => "export-1",
    getActiveRequestId: () => null,
    startRequest: () => {
      started += 1;
    },
    exportRows: async () => assert.fail("exportRows should not run"),
    downloadResult: () => assert.fail("download should not run"),
    notify: (notice) => notices.push(notice),
    finishRequest: () => undefined,
  });

  assert.equal(result, null);
  assert.equal(started, 0);
  assert.equal(notices[0]?.title, "Full result unavailable");
});

test("result export runner exports, downloads, notifies, and finalizes active request", async () => {
  let activeRequestId: string | null = null;
  const requests: ExportRowsRequest[] = [];
  const downloads: BinaryCommandResult[] = [];
  const notices: ToastOptions[] = [];
  const finished: string[] = [];

  const result = await runWorkbenchResultExport({
    connectionId: "conn-1",
    runtimeSchema: "app",
    results: { batches: [batch()] },
    activeBatchIndex: 0,
    scope: "current_page",
    format: "csv",
    isExecuting: false,
    isExporting: false,
    createRequestId: () => "export-1",
    getActiveRequestId: () => activeRequestId,
    startRequest: (requestId) => {
      activeRequestId = requestId;
    },
    exportRows: async (request) => {
      requests.push(request);
      return exportResult({ fileName: "users.csv" });
    },
    downloadResult: (downloaded) => downloads.push(downloaded),
    notify: (notice) => notices.push(notice),
    finishRequest: (requestId) => {
      finished.push(requestId);
      activeRequestId = null;
    },
  });

  assert.equal(result?.fileName, "users.csv");
  assert.equal(requests[0]?.requestId, "export-1");
  assert.equal(requests[0]?.schema, "app");
  assert.equal(requests[0]?.format, "csv");
  assert.deepEqual(requests[0]?.currentPageRows, [{ values: [1] }]);
  assert.equal(downloads[0]?.fileName, "users.csv");
  assert.equal(notices.at(-1)?.title, "Export complete");
  assert.deepEqual(finished, ["export-1"]);
});

test("result export runner centralizes export request UI state", () => {
  const events: string[] = [];
  let activeRequestId: string | null = null;

  runStartResultExportRequestState({
    requestId: "export-1",
    setActiveRequestId: (requestId) => {
      activeRequestId = requestId;
      events.push(`active:${requestId}`);
    },
    setCurrentRequestId: (requestId) => events.push(`current:${requestId}`),
    setIsExporting: (isExporting) => events.push(`exporting:${isExporting}`),
  });
  runFinishResultExportRequestState({
    requestId: "export-1",
    getActiveRequestId: () => activeRequestId,
    clearActiveRequestId: () => {
      activeRequestId = null;
      events.push("active:null");
    },
    setIsExporting: (isExporting) => events.push(`exporting:${isExporting}`),
    setCurrentRequestId: (requestId) => events.push(`current:${requestId ?? "null"}`),
  });

  assert.equal(activeRequestId, null);
  assert.deepEqual(events, [
    "active:export-1",
    "current:export-1",
    "exporting:true",
    "active:null",
    "exporting:false",
    "current:null",
  ]);
});

test("result export runner finish leaves superseding active export id intact", () => {
  const events: string[] = [];
  let activeRequestId: string | null = "export-2";

  runFinishResultExportRequestState({
    requestId: "export-1",
    getActiveRequestId: () => activeRequestId,
    clearActiveRequestId: () => {
      activeRequestId = null;
      events.push("active:null");
    },
    setIsExporting: (isExporting) => events.push(`exporting:${isExporting}`),
    setCurrentRequestId: (requestId) => events.push(`current:${requestId ?? "null"}`),
  });

  assert.equal(activeRequestId, "export-2");
  assert.deepEqual(events, ["exporting:false", "current:null"]);
});

test("result export runner creates reusable state action objects", () => {
  const events: string[] = [];
  let activeRequestId: string | null = null;
  const actions = createResultExportStateActions({
    setActiveRequestId: (requestId) => {
      activeRequestId = requestId;
      events.push(`active:${requestId}`);
    },
    getActiveRequestId: () => activeRequestId,
    clearActiveRequestId: () => {
      activeRequestId = null;
      events.push("active:null");
    },
    setCurrentRequestId: (requestId) => events.push(`current:${requestId ?? "null"}`),
    setIsExporting: (isExporting) => events.push(`exporting:${isExporting}`),
  });

  actions.startRequest("export-1");
  actions.finishRequest("export-1");

  assert.equal(activeRequestId, null);
  assert.deepEqual(events, [
    "active:export-1",
    "current:export-1",
    "exporting:true",
    "active:null",
    "exporting:false",
    "current:null",
  ]);
});

test("result export runner ignores stale export responses without download or finalize", async () => {
  let activeRequestId: string | null = null;
  let downloads = 0;
  let finished = 0;

  const result = await runWorkbenchResultExport({
    connectionId: "conn-1",
    results: { batches: [batch()] },
    activeBatchIndex: 0,
    scope: "loaded_rows",
    format: "json",
    isExecuting: false,
    isExporting: false,
    createRequestId: () => "export-1",
    getActiveRequestId: () => activeRequestId,
    startRequest: (requestId) => {
      activeRequestId = requestId;
    },
    exportRows: async () => {
      activeRequestId = "export-2";
      return exportResult();
    },
    downloadResult: () => {
      downloads += 1;
    },
    notify: () => undefined,
    finishRequest: () => {
      finished += 1;
    },
  });

  assert.equal(result, null);
  assert.equal(downloads, 0);
  assert.equal(finished, 0);
});

test("result export runner formats failures and finalizes active request", async () => {
  let activeRequestId: string | null = null;
  const notices: ToastOptions[] = [];
  let finished = 0;

  const result = await runWorkbenchResultExport({
    connectionId: "conn-1",
    results: { batches: [batch()] },
    activeBatchIndex: 0,
    scope: "loaded_rows",
    format: "json",
    isExecuting: false,
    isExporting: false,
    createRequestId: () => "export-1",
    getActiveRequestId: () => activeRequestId,
    startRequest: (requestId) => {
      activeRequestId = requestId;
    },
    exportRows: async () => {
      throw new Error("Error invoking export_rows: disk full");
    },
    downloadResult: () => assert.fail("download should not run"),
    notify: (notice) => notices.push(notice),
    finishRequest: () => {
      finished += 1;
      activeRequestId = null;
    },
  });

  assert.equal(result, null);
  assert.equal(notices[0]?.title, "Export failed");
  assert.equal(notices[0]?.description, "disk full");
  assert.equal(finished, 1);
});
