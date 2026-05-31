import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbGridEditSource,
  DbQueryBatchResult,
  DbTableSchema,
  QueryExecutionResponse,
} from "../../shared/schema";
import {
  decorateQueryResultsForEdit,
  deriveBatchEditMetadata,
} from "../../client/src/components/extensions/db-workbench/grid-edit-runtime";

function table(input: {
  name: string;
  primaryKeyColumns?: string[];
}): DbTableSchema {
  const primaryKeyColumns = new Set(input.primaryKeyColumns ?? ["id"]);
  return {
    name: input.name,
    columns: [
      {
        name: "id",
        dataType: "integer",
        nullable: false,
        primaryKey: primaryKeyColumns.has("id"),
      },
      {
        name: "name",
        dataType: "varchar",
        nullable: true,
        primaryKey: primaryKeyColumns.has("name"),
      },
    ],
    indexes: [],
    foreignKeys: [],
  };
}

function batch(overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
  return {
    sql: "select id, name from users",
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    rows: [
      { values: [1, "Aki"] },
      { values: [2, "Mina"] },
    ],
    totalRows: 2,
    returnedRows: 2,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 7,
    ...overrides,
  };
}

const source: DbGridEditSource = {
  kind: "starter-select",
  tableName: "users",
  schema: "public",
  queryMode: "select",
};

test("grid edit metadata decorates eligible starter table result columns", () => {
  const metadata = deriveBatchEditMetadata(batch(), source, {
    readonlyConnection: false,
    runtimeSchema: "public",
    schemaTables: [table({ name: "users" })],
  });

  assert.equal(metadata.eligibility.eligible, true);
  assert.deepEqual(metadata.primaryKeyColumns, ["id"]);
  assert.deepEqual(metadata.normalizedSource, source);
  assert.equal(metadata.columns[0]?.isPrimaryKey, true);
  assert.equal(metadata.columns[0]?.sourceTable, "users");
  assert.equal(metadata.columns[0]?.sourceSchema, "public");
  assert.equal(metadata.columns[1]?.sourceColumn, "name");
});

test("grid edit metadata reports explicit ineligible reasons", () => {
  assert.equal(
    deriveBatchEditMetadata(batch(), null, {
      readonlyConnection: false,
      runtimeSchema: "public",
      schemaTables: [table({ name: "users" })],
    }).eligibility.reasons[0]?.code,
    "unsupported_source",
  );

  assert.equal(
    deriveBatchEditMetadata(batch(), source, {
      readonlyConnection: true,
      runtimeSchema: "public",
      schemaTables: [table({ name: "users" })],
    }).eligibility.reasons[0]?.code,
    "readonly_connection",
  );

  assert.equal(
    deriveBatchEditMetadata(
      batch(),
      { ...source, kind: "starter-count", queryMode: "count" },
      {
        readonlyConnection: false,
        runtimeSchema: "public",
        schemaTables: [table({ name: "users" })],
      },
    ).eligibility.reasons[0]?.code,
    "count_result",
  );
});

test("grid edit metadata blocks missing and duplicate primary key tuples", () => {
  assert.equal(
    deriveBatchEditMetadata(
      batch({ columns: [{ name: "name", dataType: "varchar" }] }),
      source,
      {
        readonlyConnection: false,
        runtimeSchema: "public",
        schemaTables: [table({ name: "users" })],
      },
    ).eligibility.reasons[0]?.code,
    "missing_primary_key_column",
  );

  assert.equal(
    deriveBatchEditMetadata(
      batch({
        rows: [
          { values: [1, "Aki"] },
          { values: [1, "Aki Duplicate"] },
        ],
      }),
      source,
      {
        readonlyConnection: false,
        runtimeSchema: "public",
        schemaTables: [table({ name: "users" })],
      },
    ).eligibility.reasons[0]?.code,
    "duplicate_primary_key_tuple",
  );
});

test("query result decoration applies edit metadata and stable loaded row counters", () => {
  const response: QueryExecutionResponse = {
    requestId: "request-1",
    batches: [
      batch({
        loadedRowOffset: Number.NaN,
        loadedRowCount: undefined,
        rowWindowTruncated: false,
      }),
    ],
  };

  const decorated = decorateQueryResultsForEdit(response, source, {
    readonlyConnection: false,
    runtimeSchema: "public",
    schemaTables: [table({ name: "users" })],
  });

  assert.equal(decorated.batches[0]?.loadedRowOffset, 0);
  assert.equal(decorated.batches[0]?.loadedRowCount, 2);
  assert.equal(decorated.batches[0]?.rowWindowTruncated, undefined);
  assert.equal(decorated.batches[0]?.editEligibility?.eligible, true);
  assert.deepEqual(decorated.batches[0]?.primaryKeyColumns, ["id"]);
});
