import test from "node:test";
import assert from "node:assert/strict";
import type { BinaryCommandResult, DbQueryBatchResult, DbQueryRow } from "../../shared/schema";
import {
  base64ToBytes,
  buildExportFailureNotice,
  buildExportRowsPayload,
  buildPostExportNotice,
  getPreExportNotice,
  validateExportScope,
} from "../../client/src/components/extensions/db-workbench/result-export-runtime";

function row(...values: DbQueryRow["values"]): DbQueryRow {
  return { values };
}

function batch(overrides: Partial<DbQueryBatchResult> = {}): DbQueryBatchResult {
  return {
    sql: "select id, name from users",
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    rows: [row(1, "Aki"), row(2, "Mina"), row(3, "Rin")],
    totalRows: 3,
    returnedRows: 2,
    hasMore: false,
    pagingMode: "offset",
    elapsedMs: 9,
    ...overrides,
  };
}

function exportResult(overrides: Partial<BinaryCommandResult> = {}): BinaryCommandResult {
  return {
    base64: "SGVsbG8=",
    fileName: "users.csv",
    mimeType: "text/csv",
    successCount: 3,
    ...overrides,
  };
}

test("result export runtime decodes backend base64 payloads", () => {
  const bytes = base64ToBytes("SGVsbG8sIERCVA==");
  assert.deepEqual(Array.from(bytes), Array.from(new TextEncoder().encode("Hello, DBT")));
});

test("result export runtime blocks full export for non-pageable batches", () => {
  assert.deepEqual(
    validateExportScope(batch({ pagingMode: "none" }), "full_result"),
    {
      title: "Full result unavailable",
      description: "Only single pageable SELECT-style results support full result export.",
      variant: "destructive",
    },
  );
  assert.equal(validateExportScope(batch({ pagingMode: "offset" }), "full_result"), null);
});

test("result export runtime warns when loaded-row export uses a retained window", () => {
  assert.deepEqual(
    getPreExportNotice(batch({ rowWindowTruncated: true }), "loaded_rows"),
    {
      title: "Loaded rows limited",
      description: "Loaded-row export includes only the retained 3 row window.",
      variant: "default",
    },
  );
  assert.equal(getPreExportNotice(batch(), "current_page"), null);
});

test("result export runtime builds scope-specific export payloads", () => {
  assert.deepEqual(buildExportRowsPayload(batch(), "current_page"), {
    currentPageRows: [row(2, "Mina"), row(3, "Rin")],
    loadedRows: undefined,
    columns: [
      { name: "id", dataType: "integer" },
      { name: "name", dataType: "varchar" },
    ],
    maxRows: undefined,
  });

  assert.deepEqual(buildExportRowsPayload(batch(), "full_result"), {
    currentPageRows: undefined,
    loadedRows: undefined,
    columns: undefined,
    maxRows: 100_000,
  });
});

test("result export runtime returns capped full-result warning after export", () => {
  assert.deepEqual(
    buildPostExportNotice(exportResult({ fileName: "users-truncated.csv" }), "full_result"),
    {
      title: "Export warning",
      description: "Full result export may be truncated at 100000 rows.",
      variant: "default",
    },
  );
  assert.deepEqual(buildPostExportNotice(exportResult(), "current_page"), {
    title: "Export complete",
    description: "users.csv is ready to download.",
    variant: "success",
  });
});

test("result export runtime centralizes cancellation and failure notices", () => {
  assert.deepEqual(buildExportFailureNotice("cancelled by user"), {
    title: "Export cancelled",
    description: "cancelled by user",
    variant: "default",
  });
  assert.deepEqual(buildExportFailureNotice("disk write failed"), {
    title: "Export failed",
    description: "disk write failed",
    variant: "destructive",
  });
});
