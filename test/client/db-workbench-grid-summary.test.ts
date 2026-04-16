import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPendingDeleteRowSummaries,
  buildPendingEditRowSummaries,
  formatGridCellValue,
} from "../../client/src/components/extensions/db-workbench/grid-edit-summary.ts";

test("grid summary formatting keeps null and boolean values explicit", () => {
  assert.equal(formatGridCellValue(null), "null");
  assert.equal(formatGridCellValue(true), "true");
  assert.equal(formatGridCellValue(false), "false");
  assert.equal(formatGridCellValue("users"), "users");
});

test("pending edit summaries group row patches and sort cells by column name", () => {
  const summaries = buildPendingEditRowSummaries({
    "users:id=1:email": {
      rowPrimaryKey: { id: 1 },
      rowPkTuple: "id=1",
      columnName: "email",
      beforeValue: "old@example.com",
      nextValue: "new@example.com",
    },
    "orders:id=2:status": {
      rowPrimaryKey: { tenant: "acme", id: 2 },
      rowPkTuple: "tenant=acme|id=2",
      columnName: "status",
      beforeValue: "draft",
      nextValue: "done",
    },
    "orders:id=2:active": {
      rowPrimaryKey: { tenant: "acme", id: 2 },
      rowPkTuple: "tenant=acme|id=2",
      columnName: "active",
      beforeValue: false,
      nextValue: true,
    },
  });

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.rowKeyLabel, "id=1");
  assert.equal(summaries[1]?.rowKeyLabel, "id=2, tenant=acme");
  assert.equal(summaries[1]?.changeCount, 2);
  assert.deepEqual(
    summaries[1]?.cells.map((cell) => cell.columnName),
    ["active", "status"],
  );
});

test("pending delete summaries fall back to rowPkTuple when rowPrimaryKey is empty", () => {
  const summaries = buildPendingDeleteRowSummaries({
    "users#1": {
      rowPrimaryKey: {},
      rowPkTuple: "users#1",
    },
    "users#2": {
      rowPrimaryKey: { id: 2, tenant: "acme" },
      rowPkTuple: "tenant=acme|id=2",
    },
  });

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.rowKeyLabel, "id=2, tenant=acme");
  assert.equal(summaries[1]?.rowKeyLabel, "users#1");
  assert.equal(summaries[1]?.rowPkTuple, "users#1");
});
