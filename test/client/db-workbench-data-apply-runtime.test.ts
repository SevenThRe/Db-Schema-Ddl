import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDataApplyNotification,
  isDataApplyJobActive,
  mergeDataApplyExecutionDetail,
} from "../../client/src/components/extensions/db-workbench/data-apply-runtime";

test("data apply active status only keeps pending and running jobs polling", () => {
  assert.equal(isDataApplyJobActive("pending"), true);
  assert.equal(isDataApplyJobActive("running"), true);
  assert.equal(isDataApplyJobActive("completed"), false);
  assert.equal(isDataApplyJobActive("partial"), false);
  assert.equal(isDataApplyJobActive("failed"), false);
  assert.equal(isDataApplyJobActive(null), false);
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
