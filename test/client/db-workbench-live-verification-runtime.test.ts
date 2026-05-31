import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveVerificationCancelOutcome,
  buildLiveVerificationCancelQueryRequest,
  buildLiveVerificationCancelSql,
  buildLiveVerificationCompletedNote,
  buildLiveVerificationConnectPassedNote,
  buildLiveVerificationEditMissingPkOutcome,
  buildLiveVerificationEditPreparedOutcome,
  buildLiveVerificationEditSkippedOutcome,
  buildLiveVerificationExportOutcome,
  buildLiveVerificationFlowMetadata,
  buildLiveVerificationInspectionOutcome,
  buildLiveVerificationNoTableCompletion,
  buildLiveVerificationNoTableSkippedOutcome,
  buildLiveVerificationPagingOutcome,
  buildLiveVerificationPagingWarningOutcome,
  buildLiveVerificationQueryOutcome,
  buildLiveVerificationReadonlyOutcome,
  buildLiveVerificationRunKey,
  buildLiveVerificationSchemaMissingOutcome,
  getNoTableLiveVerificationFlowIds,
  isLiveVerificationCancelMessage,
  shouldAttemptLiveVerificationEdit,
  shouldAttemptLiveVerificationPaging,
  shouldRunWorkbenchLiveVerification,
} from "../../client/src/components/extensions/db-workbench/live-verification-runtime";
import type { DbConnectionConfig, DbQueryBatchResult } from "../../shared/schema";

function createConnection(
  overrides: Partial<DbConnectionConfig> = {},
): DbConnectionConfig {
  return {
    id: "conn-1",
    name: "Reporting DB",
    driver: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database: "reporting",
    username: "root",
    password: "secret",
    ...overrides,
  };
}

test("live verification runtime gates runs by release config and selected connection", () => {
  const connection = createConnection();

  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: true },
      connection,
      isSchemaLoading: false,
    }),
    true,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: false,
      liveConfig: { enabled: true },
      connection,
      isSchemaLoading: false,
    }),
    false,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: false },
      connection,
      isSchemaLoading: false,
    }),
    false,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: true, driver: "postgres" },
      connection,
      isSchemaLoading: false,
    }),
    false,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: true, connectionId: "other" },
      connection,
      isSchemaLoading: false,
    }),
    false,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: true, connectionName: " reporting db " },
      connection,
      isSchemaLoading: false,
    }),
    true,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: true, connectionName: "warehouse" },
      connection,
      isSchemaLoading: false,
    }),
    false,
  );
  assert.equal(
    shouldRunWorkbenchLiveVerification({
      releaseEnabled: true,
      liveConfig: { enabled: true },
      connection,
      isSchemaLoading: true,
    }),
    false,
  );
});

test("live verification runtime builds stable metadata and flow constants", () => {
  const connection = createConnection({ id: "mysql-prod", name: "" });

  assert.equal(buildLiveVerificationRunKey(connection), "mysql-prod:mysql");
  assert.deepEqual(buildLiveVerificationFlowMetadata(connection), {
    driver: "mysql",
    connectionId: "mysql-prod",
    connectionName: "reporting",
  });
  assert.deepEqual(getNoTableLiveVerificationFlowIds(), [
    "inspection",
    "query",
    "paging",
    "export",
    "edit",
    "readonly",
    "cancel",
  ]);
});

test("live verification runtime isolates cancellation SQL and response matching", () => {
  assert.equal(buildLiveVerificationCancelSql("mysql"), "SELECT SLEEP(8);");
  assert.equal(buildLiveVerificationCancelSql("postgres"), "SELECT pg_sleep(8);");
  assert.deepEqual(
    buildLiveVerificationCancelQueryRequest({
      connectionId: "conn-1",
      driver: "postgres",
      requestId: "request-1",
      schema: "app",
    }),
    {
      connectionId: "conn-1",
      sql: "SELECT pg_sleep(8);",
      requestId: "request-1",
      schema: "app",
    },
  );
  assert.equal(isLiveVerificationCancelMessage("Query cancelled by request"), true);
  assert.equal(isLiveVerificationCancelMessage("クエリがキャンセルされました"), true);
  assert.equal(isLiveVerificationCancelMessage("syntax error near select"), false);
  assert.deepEqual(buildLiveVerificationCancelOutcome("mysql", true), {
    status: "passed",
    note: "Cancelled verification query on mysql.",
  });
  assert.deepEqual(buildLiveVerificationCancelOutcome("postgres", false), {
    status: "failed",
    note:
      "Cancellation did not surface a cancellable runtime response on postgres.",
  });
});

test("live verification runtime centralizes flow outcome copy", () => {
  const connection = createConnection();
  const batch = createBatch({
    rows: [{ values: [1, "Ada"] }],
    hasMore: true,
    pagingMode: "offset",
    editEligibility: { eligible: true, reasons: [] },
    primaryKeyColumns: ["id"],
  });

  assert.deepEqual(buildLiveVerificationSchemaMissingOutcome("login failed"), {
    connect: { status: "failed", note: "login failed" },
    completion: "failed",
    completionNote:
      "Live verification stopped before query flows because the connection could not be established.",
  });
  assert.equal(
    buildLiveVerificationConnectPassedNote(connection),
    "Connected to mysql 127.0.0.1:3306/reporting.",
  );
  assert.deepEqual(buildLiveVerificationNoTableSkippedOutcome(), {
    status: "skipped",
    note: "No tables were available in the schema snapshot.",
  });
  assert.deepEqual(buildLiveVerificationNoTableCompletion(), {
    status: "warning",
    note:
      "Connected successfully, but the schema has no tables so deeper workbench flows were skipped.",
  });
  assert.deepEqual(buildLiveVerificationInspectionOutcome("users", true), {
    status: "passed",
    note: "Inspected table users.",
  });
  assert.deepEqual(buildLiveVerificationQueryOutcome("users", batch), {
    status: "passed",
    note: "Loaded 1 rows from users.",
  });
  assert.deepEqual(buildLiveVerificationQueryOutcome("users", null), {
    status: "failed",
    note: "Failed to execute starter query for users.",
  });
  assert.equal(shouldAttemptLiveVerificationPaging(batch), true);
  assert.equal(shouldAttemptLiveVerificationPaging(createBatch({ hasMore: false })), false);
  assert.deepEqual(buildLiveVerificationPagingOutcome("users", true), {
    status: "passed",
    note: "Fetched additional rows for users.",
  });
  assert.deepEqual(buildLiveVerificationPagingWarningOutcome("users"), {
    status: "warning",
    note: "The starter query for users did not expose offset paging evidence.",
  });
  assert.deepEqual(
    buildLiveVerificationExportOutcome("users", { fileName: "users.json" }),
    {
      status: "passed",
      note: "Exported current-page result to users.json.",
    },
  );
  assert.deepEqual(buildLiveVerificationEditPreparedOutcome("users", true), {
    status: "passed",
    note: "Prepared a review-only delete plan for users without committing it.",
  });
  assert.deepEqual(buildLiveVerificationEditMissingPkOutcome("users"), {
    status: "warning",
    note: "Could not resolve primary key values for users.",
  });
  assert.deepEqual(
    buildLiveVerificationEditSkippedOutcome({ tableName: "users", readonly: true }),
    {
      status: "warning",
      note: "The selected connection is read-only, so edit verification was not attempted.",
    },
  );
  assert.deepEqual(buildLiveVerificationReadonlyOutcome(false), {
    status: "warning",
    note:
      "Selected connection is writable; readonly guardrails were not exercised in this run.",
  });
  assert.equal(shouldAttemptLiveVerificationEdit(batch), true);
  assert.equal(shouldAttemptLiveVerificationEdit(createBatch({ rows: [] })), false);
  assert.equal(
    buildLiveVerificationCompletedNote("Reporting DB"),
    "Completed live verification flows for Reporting DB.",
  );
});

function createBatch(
  overrides: Partial<DbQueryBatchResult> = {},
): DbQueryBatchResult {
  return {
    sql: "SELECT * FROM users",
    columns: [{ name: "id", dataType: "int", isPrimaryKey: true }],
    rows: [],
    totalRows: null,
    returnedRows: 0,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 1,
    ...overrides,
  };
}
