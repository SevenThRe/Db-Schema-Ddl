import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchResultWorkspaceController,
} from "../../client/src/components/extensions/db-workbench/workbench-result-workspace-controller";
import type {
  BinaryCommandResult,
  DbQueryBatchResult,
  ExportRowsRequest,
  FetchMoreRequest,
  QueryExecutionResponse,
} from "../../shared/schema";

function batch(overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
  return {
    sql: "select id, name from users order by id",
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    rows: [{ values: [1, "Ada"] }],
    totalRows: 2,
    returnedRows: 1,
    hasMore: true,
    pagingMode: "offset",
    nextOffset: 1,
    elapsedMs: 5,
    primaryKeyColumns: ["id"],
    ...overrides,
  };
}

function response(overrides: Partial<QueryExecutionResponse> = {}): QueryExecutionResponse {
  return {
    requestId: "query-1",
    batches: [batch()],
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

test("result workspace controller routes load-more through the shared runner boundary", async () => {
  const requests: FetchMoreRequest[] = [];
  let currentResults: QueryExecutionResponse | null = response();

  const controller = createWorkbenchResultWorkspaceController({
    connectionId: "conn-1",
    runtimeSchema: "public",
    results: currentResults,
    activeBatchIndex: 0,
    pendingEditCells: {},
    pendingDeleteRows: {},
    isExecuting: false,
    isExporting: false,
    resultWindowLimit: 5000,
    loadMoreLimit: 250,
    fetchMore: async (request) => {
      requests.push(request);
      return batch({
        rows: [{ values: [2, "Grace"] }],
        returnedRows: 1,
        hasMore: false,
        nextOffset: undefined,
      });
    },
    updateResults: (updater) => {
      currentResults = updater(currentResults);
    },
    exportRows: async () => assert.fail("exportRows should not run"),
    downloadResult: () => assert.fail("download should not run"),
    createExportRequestId: () => "export-1",
    getActiveExportRequestId: () => null,
    resultExportActions: {
      startRequest: () => assert.fail("start export should not run"),
      finishRequest: () => assert.fail("finish export should not run"),
    },
    showNotification: () => undefined,
    hasShownWindowCapNotice: () => false,
    markWindowCapNoticeShown: () => undefined,
  });

  const loaded = await controller.handleLoadMore(0);

  assert.equal(loaded?.rows[0]?.values[0], 2);
  assert.deepEqual(requests, [
    {
      requestId: "query-1",
      batchIndex: 0,
      sql: "select id, name from users order by id",
      connectionId: "conn-1",
      schema: "public",
      offset: 1,
      limit: 250,
    },
  ]);
  assert.equal(currentResults?.batches[0]?.rows.length, 2);
});

test("result workspace controller routes export with request state and download side effects", async () => {
  const exportRequests: ExportRowsRequest[] = [];
  const downloads: BinaryCommandResult[] = [];
  const events: string[] = [];
  let activeExportRequestId: string | null = null;

  const controller = createWorkbenchResultWorkspaceController({
    connectionId: "conn-1",
    runtimeSchema: "app",
    results: response({ batches: [batch({ hasMore: false })] }),
    activeBatchIndex: 0,
    pendingEditCells: {},
    pendingDeleteRows: {},
    isExecuting: false,
    isExporting: false,
    resultWindowLimit: 5000,
    loadMoreLimit: 1000,
    fetchMore: async () => assert.fail("fetchMore should not run"),
    updateResults: () => assert.fail("updateResults should not run"),
    exportRows: async (request) => {
      exportRequests.push(request);
      return exportResult({ fileName: "users.csv" });
    },
    downloadResult: (result) => {
      downloads.push(result);
    },
    createExportRequestId: () => "export-1",
    getActiveExportRequestId: () => activeExportRequestId,
    resultExportActions: {
      startRequest: (requestId) => {
        activeExportRequestId = requestId;
        events.push(`start:${requestId}`);
      },
      finishRequest: (requestId) => {
        activeExportRequestId = null;
        events.push(`finish:${requestId}`);
      },
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    hasShownWindowCapNotice: () => false,
    markWindowCapNoticeShown: () => undefined,
  });

  const exported = await controller.handleExport("current_page", "csv");

  assert.equal(exported?.fileName, "users.csv");
  assert.equal(exportRequests[0]?.connectionId, "conn-1");
  assert.equal(exportRequests[0]?.requestId, "export-1");
  assert.equal(exportRequests[0]?.schema, "app");
  assert.equal(exportRequests[0]?.format, "csv");
  assert.deepEqual(exportRequests[0]?.currentPageRows, [{ values: [1, "Ada"] }]);
  assert.equal(downloads[0]?.fileName, "users.csv");
  assert.deepEqual(events, [
    "start:export-1",
    "notice:Export complete",
    "finish:export-1",
  ]);
});
