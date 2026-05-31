import test from "node:test";
import assert from "node:assert/strict";
import type { DbQueryBatchResult, DbQueryRow } from "../../shared/schema";
import {
  buildRowPrimaryKey,
  buildRowPkTuple,
  getCurrentPageRows,
  getLoadedRowCount,
  getLoadedRowOffset,
  isCellValueEqual,
  mergeFetchedRowsIntoBatch,
  quoteIdentifier,
  trimRowsForMemory,
} from "../../client/src/components/extensions/db-workbench/result-grid-utils";

function row(...values: DbQueryRow["values"]): DbQueryRow {
  return { values };
}

function batch(rows: DbQueryRow[], overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
  return {
    sql: "select id, name from employees",
    columns: [
      { name: "id", dataType: "bigint" },
      { name: "name", dataType: "varchar" },
    ],
    rows,
    totalRows: rows.length,
    returnedRows: rows.length,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 1,
    ...overrides,
  };
}

test("result grid quoting follows driver identifier rules", () => {
  assert.equal(quoteIdentifier("mysql", "user`table"), "`user``table`");
  assert.equal(quoteIdentifier("postgres", 'user"table'), '"user""table"');
});

test("result grid row primary key helpers build stable tuples", () => {
  const resultBatch = batch([row(7, "Aki")], {
    primaryKeyColumns: ["id"],
  });

  const primaryKey = buildRowPrimaryKey(resultBatch.rows[0]!, resultBatch, ["id"]);

  assert.deepEqual(primaryKey, { id: 7 });
  assert.equal(buildRowPkTuple(primaryKey!, ["id"]), "id=7");
  assert.equal(isCellValueEqual(null, null), true);
  assert.equal(isCellValueEqual("7", 7), false);
});

test("result grid loaded row counters normalize missing and invalid values", () => {
  assert.equal(getLoadedRowOffset(batch([])), 0);
  assert.equal(getLoadedRowOffset(batch([], { loadedRowOffset: -12 })), 0);
  assert.equal(getLoadedRowOffset(batch([], { loadedRowOffset: 3.9 })), 3);
  assert.equal(getLoadedRowCount(batch([row(1, "Aki")], { returnedRows: 9 })), 9);
  assert.equal(getLoadedRowCount(batch([row(1, "Aki")], { loadedRowCount: 2.7 })), 2);
});

test("result grid current page rows derive from returned row count", () => {
  const resultBatch = batch(
    [row(1, "A"), row(2, "B"), row(3, "C"), row(4, "D")],
    { returnedRows: 2 },
  );

  assert.deepEqual(getCurrentPageRows(resultBatch), [row(3, "C"), row(4, "D")]);
});

test("result grid memory trimming preserves protected edited rows", () => {
  const resultBatch = batch(
    [row(1, "A"), row(2, "B"), row(3, "C"), row(4, "D")],
    { primaryKeyColumns: ["id"] },
  );

  const trimmed = trimRowsForMemory(
    resultBatch,
    resultBatch.rows,
    new Set(["id=1"]),
    2,
  );

  assert.equal(trimmed.droppedRows, 2);
  assert.deepEqual(trimmed.rows, [row(1, "A"), row(4, "D")]);
});

test("result grid fetch-more merge updates counters and caps retained row window", () => {
  const resultBatch = batch(
    [row(1, "A"), row(2, "B"), row(3, "C")],
    {
      primaryKeyColumns: ["id"],
      pagingMode: "offset",
      hasMore: true,
      loadedRowOffset: 0,
      loadedRowCount: 3,
      returnedRows: 3,
      elapsedMs: 5,
    },
  );
  const moreBatch = batch(
    [row(4, "D"), row(5, "E")],
    {
      totalRows: 5,
      returnedRows: 2,
      hasMore: false,
      pagingMode: "offset",
      nextOffset: undefined,
      elapsedMs: 7,
    },
  );

  const merged = mergeFetchedRowsIntoBatch(
    resultBatch,
    moreBatch,
    new Set(["id=1"]),
    3,
  );

  assert.equal(merged.droppedRows, 2);
  assert.deepEqual(merged.batch.rows, [row(1, "A"), row(4, "D"), row(5, "E")]);
  assert.equal(merged.batch.loadedRowOffset, 2);
  assert.equal(merged.batch.loadedRowCount, 5);
  assert.equal(merged.batch.rowWindowTruncated, true);
  assert.equal(merged.batch.totalRows, 5);
  assert.equal(merged.batch.hasMore, false);
  assert.equal(merged.batch.elapsedMs, 12);
});
