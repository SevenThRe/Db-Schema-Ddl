import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDataApplyExecuteRequest,
  buildDataApplyNotification,
  formatDataApplyExecuteError,
  getDataApplyJobPollDelayMs,
  getDataApplyJobRetryDelayMs,
  isDataApplyJobActive,
  mergeDataApplyExecutionDetail,
  validateDataApplyExecutionReadiness,
} from "../../client/src/components/extensions/db-workbench/data-apply-runtime";

test("data apply active status only keeps pending and running jobs polling", () => {
  assert.equal(isDataApplyJobActive("pending"), true);
  assert.equal(isDataApplyJobActive("running"), true);
  assert.equal(isDataApplyJobActive("completed"), false);
  assert.equal(isDataApplyJobActive("partial"), false);
  assert.equal(isDataApplyJobActive("failed"), false);
  assert.equal(isDataApplyJobActive(null), false);
  assert.equal(getDataApplyJobPollDelayMs("pending"), 1500);
  assert.equal(getDataApplyJobPollDelayMs("running"), 1500);
  assert.equal(getDataApplyJobPollDelayMs("completed"), null);
  assert.equal(getDataApplyJobRetryDelayMs(), 3000);
});

test("data apply notification copy is centralized by status", () => {
  const counts = { insert: 2, update: 3, delete: 4, unchanged: 5 };

  assert.deepEqual(buildDataApplyNotification("running", counts), {
    title: "Data Sync apply started",
    description: "The apply job is running in the background. Job detail will refresh automatically.",
    variant: "default",
  });

  assert.deepEqual(buildDataApplyNotification("completed", counts), {
    title: "Data Sync apply completed",
    description: "9 row actions executed. Re-run compare to refresh deltas.",
    variant: "success",
  });

  assert.deepEqual(buildDataApplyNotification("partial", counts, "execute"), {
    title: "Data Sync apply finished with partial failures",
    description: "The apply job completed with some failed row actions. Open Job Center for the persisted audit trail.",
    variant: "destructive",
  });

  assert.deepEqual(buildDataApplyNotification("partial", counts, "detail"), {
    title: "Data Sync apply finished with partial failures",
    description: "The apply job completed with partial failures. Open Job Center for the persisted audit trail.",
    variant: "destructive",
  });

  assert.deepEqual(buildDataApplyNotification("failed", counts), {
    title: "Data Sync apply finished with failure",
    description: "The apply transaction did not fully commit. Review job detail for failure context.",
    variant: "destructive",
  });
});

test("data apply execute runtime validates readiness and builds backend request", () => {
  const selection = {
    tableName: "users",
    rowKey: { id: 1 },
    action: "update" as const,
  };
  const diffPreview = {
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "target-hash",
    createdAt: "2026-05-31T00:00:00.000Z",
    expiresAt: "2026-05-31T01:00:00.000Z",
    tableSummaries: [],
    statusCounts: { insert: 1, update: 0, delete: 0, unchanged: 0 },
    blockers: [],
  };
  const applyPreview = {
    compareId: "compare-1",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    statusCounts: { insert: 1, update: 0, delete: 0, unchanged: 0 },
    sqlPreviewLines: [],
    previewTruncated: false,
    blockers: [],
    executable: true,
  };

  assert.equal(
    validateDataApplyExecutionReadiness({
      diffPreview: null,
      applyPreview,
      selections: [selection],
    }),
    "Run compare preview and apply preview before execute.",
  );
  assert.equal(
    validateDataApplyExecutionReadiness({
      diffPreview,
      applyPreview,
      selections: [],
    }),
    "No row actions are selected for apply execution.",
  );
  assert.equal(
    validateDataApplyExecutionReadiness({
      diffPreview,
      applyPreview,
      selections: [selection],
    }),
    null,
  );

  assert.deepEqual(
    buildDataApplyExecuteRequest({
      diffPreview,
      applyPreview,
      sourceConnectionId: "source-1",
      targetConnectionId: "target-1",
      selections: [selection],
      deleteWarningThreshold: 500,
      confirmUnsafeDelete: true,
      targetDatabaseConfirmation: " prod_db ",
    }),
    {
      compareId: "compare-1",
      sourceConnectionId: "source-1",
      targetConnectionId: "target-1",
      targetSnapshotHash: "target-hash",
      currentTargetSnapshotHash: "target-current",
      selections: [selection],
      deleteWarningThreshold: 500,
      confirmUnsafeDelete: true,
      targetDatabaseConfirmation: "prod_db",
    },
  );
  assert.equal(formatDataApplyExecuteError(new Error("apply failed")), "apply failed");
});

test("data apply execute responses merge matching job detail without losing snapshot fallback", () => {
  const current = {
    jobId: "job-1",
    compareId: "cmp-1",
    targetSnapshotHash: "snapshot-a",
    currentTargetSnapshotHash: "runtime-a",
    status: "running" as const,
    statusCounts: { insert: 0, update: 0, delete: 0, unchanged: 0 },
    tableResults: [],
    blockers: [],
  };
  const detail = {
    jobId: "job-1",
    compareId: "cmp-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "snapshot-a",
    currentTargetSnapshotHash: undefined,
    status: "partial" as const,
    statusCounts: { insert: 1, update: 2, delete: 3, unchanged: 4 },
    tableResults: [{ tableName: "users", action: "update" as const, attemptedRows: 2, succeededRows: 1, failedRows: 1, error: "boom" }],
    blockers: [{ code: "artifact_expired" as const, message: "refresh" }],
    sqlPreviewLines: [],
    previewTruncated: false,
    statementCount: 2,
    createdAt: "2026-04-17T00:00:00.000Z",
  };

  assert.deepEqual(mergeDataApplyExecutionDetail(current, detail), {
    ...current,
    currentTargetSnapshotHash: "runtime-a",
    status: "partial",
    statusCounts: { insert: 1, update: 2, delete: 3, unchanged: 4 },
    tableResults: [{ tableName: "users", action: "update", attemptedRows: 2, succeededRows: 1, failedRows: 1, error: "boom" }],
    blockers: [{ code: "artifact_expired", message: "refresh" }],
  });

  assert.equal(
    mergeDataApplyExecutionDetail(current, {
      ...detail,
      jobId: "job-2",
    }),
    current,
  );

  assert.deepEqual(
    mergeDataApplyExecutionDetail(current, detail, { refreshCurrentTargetSnapshotHash: false }),
    {
      ...current,
      currentTargetSnapshotHash: "runtime-a",
      status: "partial",
      statusCounts: { insert: 1, update: 2, delete: 3, unchanged: 4 },
      tableResults: [{ tableName: "users", action: "update", attemptedRows: 2, succeededRows: 1, failedRows: 1, error: "boom" }],
      blockers: [{ code: "artifact_expired", message: "refresh" }],
    },
  );
});
