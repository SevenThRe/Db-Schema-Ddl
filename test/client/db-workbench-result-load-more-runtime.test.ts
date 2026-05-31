import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbQueryBatchResult,
  DbQueryRow,
  QueryExecutionResponse,
} from "../../shared/schema";
import {
  buildFetchMoreRequest,
  buildLoadMoreFailureNotice,
  buildProtectedRowPkTuples,
  buildResultWindowCappedNotice,
  mergeFetchedBatchIntoResponse,
  validateLoadMoreBatch,
} from "../../client/src/components/extensions/db-workbench/result-load-more-runtime";

function row(...values: DbQueryRow["values"]): DbQueryRow {
  return { values };
}

function batch(
  rows: DbQueryRow[] = [row(1, "Aki")],
  overrides: Partial<DbQueryBatchResult> = {},
): DbQueryBatchResult {
  return {
    sql: "select id, name from users",
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    rows,
    totalRows: rows.length,
    returnedRows: rows.length,
    hasMore: true,
    pagingMode: "offset",
    nextOffset: rows.length,
    elapsedMs: 5,
    primaryKeyColumns: ["id"],
    ...overrides,
  };
}

function response(): QueryExecutionResponse {
  return {
    requestId: "request-1",
    batches: [
      batch([row(1, "A"), row(2, "B"), row(3, "C")], {
        loadedRowCount: 3,
      }),
    ],
  };
}

test("load-more runtime validates unsupported and malformed paging state", () => {
  assert.deepEqual(
    validateLoadMoreBatch(batch([], {
      pagingMode: "unsupported",
      pagingReason: "multi statement",
    })),
    {
      ok: false,
      notice: {
        title: "Load more unavailable",
        description: "multi statement",
        variant: "destructive",
      },
    },
  );
  assert.deepEqual(validateLoadMoreBatch(batch([], { hasMore: false })), { ok: false });
  assert.deepEqual(
    validateLoadMoreBatch(batch([], { nextOffset: undefined })),
    {
      ok: false,
      notice: {
        title: "Load more unavailable",
        description: "Next page offset was not provided by the runtime.",
        variant: "destructive",
      },
    },
  );
});

test("load-more runtime builds fetchMore request payload", () => {
  assert.deepEqual(
    buildFetchMoreRequest({
      requestId: "request-1",
      batchIndex: 2,
      batch: batch([row(1, "A")], { nextOffset: 100 }),
      connectionId: "conn-1",
      runtimeSchema: "public",
      limit: 1000,
    }),
    {
      requestId: "request-1",
      batchIndex: 2,
      sql: "select id, name from users",
      connectionId: "conn-1",
      schema: "public",
      offset: 100,
      limit: 1000,
    },
  );
});

test("load-more runtime protects edited and delete-staged rows during merge", () => {
  const protectedRows = buildProtectedRowPkTuples(
    {
      "id=1::name": {
        rowPrimaryKey: { id: 1 },
        rowPkTuple: "id=1",
        columnName: "name",
        beforeValue: "A",
        nextValue: "A+",
      },
    },
    {
      "id=2": {
        rowPrimaryKey: { id: 2 },
        rowPkTuple: "id=2",
      },
    },
  );
  const merged = mergeFetchedBatchIntoResponse({
    response: response(),
    batchIndex: 0,
    moreBatch: batch([row(4, "D"), row(5, "E")], {
      returnedRows: 2,
      hasMore: false,
      nextOffset: undefined,
      totalRows: 5,
      elapsedMs: 7,
    }),
    protectedRowPkTuples: protectedRows,
    windowLimit: 3,
  });

  assert.equal(merged.droppedRows, 2);
  assert.deepEqual(merged.response.batches[0]?.rows, [
    row(1, "A"),
    row(2, "B"),
    row(5, "E"),
  ]);
  assert.equal(merged.response.batches[0]?.loadedRowCount, 5);
  assert.equal(merged.response.batches[0]?.rowWindowTruncated, true);
});

test("load-more runtime centralizes window cap and failure notices", () => {
  assert.deepEqual(buildResultWindowCappedNotice(5000), {
    title: "Result window capped",
    description: "Older loaded rows were released to keep this result within the 5,000 row memory window.",
    variant: "default",
  });
  assert.deepEqual(buildLoadMoreFailureNotice("boom"), {
    title: "Load more failed",
    description: "boom",
    variant: "destructive",
  });
});
