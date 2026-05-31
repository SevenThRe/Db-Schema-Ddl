import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbQueryBatchResult,
  FetchMoreRequest,
  QueryExecutionResponse,
} from "../../shared/schema";
import { runResultLoadMore } from "../../client/src/components/extensions/db-workbench/result-load-more-runner";

function batch(overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
  return {
    sql: "select id, name from users order by id",
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    rows: [{ values: [1, "Ada"] }],
    totalRows: 3,
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

test("load-more runner fetches the next page and merges it into results", async () => {
  const requests: FetchMoreRequest[] = [];
  const events: string[] = [];
  let currentResults: QueryExecutionResponse | null = response();

  const result = await runResultLoadMore({
    results: currentResults,
    batchIndex: 0,
    connectionId: "conn-1",
    runtimeSchema: "public",
    pendingEditCells: {},
    pendingDeleteRows: {},
    windowLimit: 5000,
    limit: 1000,
    fetchMore: async (request) => {
      requests.push(request);
      return batch({
        rows: [{ values: [2, "Grace"] }],
        returnedRows: 1,
        hasMore: true,
        nextOffset: 2,
        elapsedMs: 6,
      });
    },
    updateResults: (updater) => {
      currentResults = updater(currentResults);
      events.push("update");
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    hasShownWindowCapNotice: () => false,
    markWindowCapNoticeShown: () => events.push("mark-window"),
  });

  assert.equal(result?.rows[0]?.values[0], 2);
  assert.deepEqual(requests, [
    {
      requestId: "query-1",
      batchIndex: 0,
      sql: "select id, name from users order by id",
      connectionId: "conn-1",
      schema: "public",
      offset: 1,
      limit: 1000,
    },
  ]);
  assert.equal(currentResults?.batches[0]?.rows.length, 2);
  assert.equal(currentResults?.batches[0]?.loadedRowCount, 2);
  assert.deepEqual(events, ["update"]);
});

test("load-more runner surfaces validation notices before backend calls", async () => {
  const events: string[] = [];
  const result = await runResultLoadMore({
    results: response({
      batches: [
        batch({
          hasMore: true,
          pagingMode: "unsupported",
          pagingReason: "multi statement result",
        }),
      ],
    }),
    batchIndex: 0,
    connectionId: "conn-1",
    runtimeSchema: null,
    pendingEditCells: {},
    pendingDeleteRows: {},
    windowLimit: 5000,
    limit: 1000,
    fetchMore: async () => assert.fail("fetchMore should not run"),
    updateResults: () => assert.fail("updateResults should not run"),
    showNotification: (notice) => events.push(`${notice.title}:${notice.description}`),
    hasShownWindowCapNotice: () => false,
    markWindowCapNoticeShown: () => assert.fail("mark should not run"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "Load more unavailable:multi statement result",
  ]);
});

test("load-more runner emits one window cap notice when old rows are released", async () => {
  const events: string[] = [];
  let currentResults: QueryExecutionResponse | null = response({
    batches: [
      batch({
        rows: [
          { values: [1, "Ada"] },
          { values: [2, "Grace"] },
        ],
        returnedRows: 2,
        loadedRowCount: 2,
        nextOffset: 2,
      }),
    ],
  });
  const shown = new Set<number>();

  const result = await runResultLoadMore({
    results: currentResults,
    batchIndex: 0,
    connectionId: "conn-1",
    runtimeSchema: "public",
    pendingEditCells: {},
    pendingDeleteRows: {},
    windowLimit: 2,
    limit: 1000,
    fetchMore: async () =>
      batch({
        rows: [{ values: [3, "Lin"] }],
        returnedRows: 1,
        hasMore: false,
        nextOffset: undefined,
      }),
    updateResults: (updater) => {
      currentResults = updater(currentResults);
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    hasShownWindowCapNotice: (index) => shown.has(index),
    markWindowCapNoticeShown: (index) => {
      shown.add(index);
      events.push(`mark:${index}`);
    },
  });

  assert.equal(result?.hasMore, false);
  assert.equal(currentResults?.batches[0]?.rows.length, 2);
  assert.equal(currentResults?.batches[0]?.loadedRowOffset, 1);
  assert.equal(currentResults?.batches[0]?.rowWindowTruncated, true);
  assert.deepEqual(events, ["mark:0", "notice:Result window capped"]);
});

test("load-more runner formats backend failures", async () => {
  const events: string[] = [];
  const result = await runResultLoadMore({
    results: response(),
    batchIndex: 0,
    connectionId: "conn-1",
    runtimeSchema: "public",
    pendingEditCells: {},
    pendingDeleteRows: {},
    windowLimit: 5000,
    limit: 1000,
    fetchMore: async () => {
      throw new Error("Error invoking fetch_more: denied");
    },
    updateResults: () => assert.fail("updateResults should not run"),
    showNotification: (notice) => events.push(`${notice.title}:${notice.description}`),
    hasShownWindowCapNotice: () => false,
    markWindowCapNoticeShown: () => assert.fail("mark should not run"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, ["Load more failed:denied"]);
});
