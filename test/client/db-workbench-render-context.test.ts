import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbenchRenderContext } from "../../client/src/components/extensions/db-workbench/workbench-render-context";
import type {
  DbConnectionConfig,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  QueryExecutionResponse,
} from "../../shared/schema";

const connection: DbConnectionConfig = {
  id: "conn-1",
  name: "Local app",
  driver: "postgres",
  host: "127.0.0.1",
  port: 5432,
  database: "app",
  username: "postgres",
  password: "",
  environment: "dev",
};

test("workbench render context centralizes active batch and pending grid summaries", () => {
  const results: QueryExecutionResponse = {
    requestId: "req-1",
    sql: "select * from users",
    durationMs: 12,
    affectedRows: null,
    rowCount: 1,
    columns: ["id"],
    rows: [{ id: 1 }],
    batches: [
      {
        statementIndex: 0,
        statementSql: "select 1",
        statementKind: "select",
        columns: ["one"],
        rows: [{ one: 1 }],
        rowCount: 1,
        affectedRows: null,
        durationMs: 1,
        truncated: false,
      },
      {
        statementIndex: 1,
        statementSql: "select 2",
        statementKind: "select",
        columns: ["two"],
        rows: [{ two: 2 }],
        rowCount: 1,
        affectedRows: null,
        durationMs: 1,
        truncated: false,
      },
    ],
  };
  const pendingEditCells: Record<string, DbGridEditPatchCell> = {
    "1::name": {
      rowPkTuple: "1",
      rowPrimaryKey: { id: 1 },
      columnName: "name",
      beforeValue: "old",
      nextValue: "new",
    },
  };
  const pendingDeleteRows: Record<string, DbGridDeleteRowDraft> = {
    "2": {
      rowPkTuple: "2",
      rowPrimaryKey: { id: 2 },
    },
  };
  const pendingInsertedRows: Record<string, DbGridInsertedRowDraft> = {
    draft_empty: {
      rowDraftId: "draft_empty",
      values: {},
    },
    draft_full: {
      rowDraftId: "draft_full",
      values: { name: "Ada" },
    },
  };

  const context = buildWorkbenchRenderContext({
    connection,
    results,
    activeBatchIndex: 1,
    pendingEditCells,
    pendingDeleteRows,
    pendingInsertedRows,
    pendingSnippetName: " Daily Query ",
    savedSnippets: [{ name: "daily query" }],
    objectInspection: null,
  });

  assert.equal(context.activeBatch?.statementSql, "select 2");
  assert.equal(context.pendingEditCount, 1);
  assert.equal(context.pendingDeleteCount, 1);
  assert.equal(context.pendingInsertedCount, 1);
  assert.deepEqual(context.pendingEditRows.map((row) => row.rowKeyLabel), [
    "id=1",
  ]);
  assert.deepEqual(
    context.pendingDeletedRows.map((row) => row.rowKeyLabel),
    ["id=2"],
  );
  assert.equal(context.pendingInsertedRowSummaries.length, 2);
  assert.equal(context.willOverwriteSnippet, true);
  assert.equal(context.driverLabel, "PostgreSQL");
  assert.equal(context.workbenchContextLabel, "PostgreSQL://127.0.0.1:5432/app");
});

test("workbench render context keeps empty snippet names and missing inspection fail-closed", () => {
  const context = buildWorkbenchRenderContext({
    connection: {
      ...connection,
      driver: "mysql",
      port: 3306,
    },
    results: null,
    activeBatchIndex: 0,
    pendingEditCells: {},
    pendingDeleteRows: {},
    pendingInsertedRows: {},
    pendingSnippetName: "   ",
    savedSnippets: [{ name: "" }],
    objectInspection: null,
  });

  assert.equal(context.activeBatch, null);
  assert.equal(context.willOverwriteSnippet, false);
  assert.equal(context.inspectedObjectKind, null);
  assert.equal(context.driverLabel, "MySQL");
  assert.equal(context.workbenchContextLabel, "MySQL://127.0.0.1:3306/app");
});
