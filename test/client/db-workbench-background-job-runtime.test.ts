import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "../../shared/schema";
import {
  mergeBackgroundJobs,
  toBackgroundJobSummary,
} from "../../client/src/components/extensions/db-workbench/background-job-runtime";

function job(input: Partial<DbBackgroundJobSummary> & { jobId: string }): DbBackgroundJobSummary {
  return {
    jobId: input.jobId,
    jobKind: "data-apply",
    title: input.title ?? "Data Sync Apply",
    status: input.status ?? "pending",
    statusCounts: input.statusCounts ?? {
      insert: 0,
      update: 0,
      delete: 0,
      unchanged: 0,
    },
    blockers: input.blockers ?? [],
    tableCount: input.tableCount ?? 1,
    statementCount: input.statementCount ?? 0,
    sqlPreviewLines: input.sqlPreviewLines ?? [],
    previewTruncated: input.previewTruncated ?? false,
    createdAt: input.createdAt ?? "2026-05-30T10:00:00.000Z",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    sourceConnectionId: input.sourceConnectionId,
    targetConnectionId: input.targetConnectionId,
    primaryTableName: input.primaryTableName,
    failureSummary: input.failureSummary,
  };
}

test("background jobs merge by job id and sort newest active work first", () => {
  const merged = mergeBackgroundJobs(
    [
      job({
        jobId: "older",
        status: "running",
        createdAt: "2026-05-30T10:00:00.000Z",
        startedAt: "2026-05-30T10:01:00.000Z",
      }),
      job({
        jobId: "same",
        status: "pending",
        createdAt: "2026-05-30T10:02:00.000Z",
      }),
    ],
    [
      job({
        jobId: "same",
        status: "completed",
        createdAt: "2026-05-30T10:02:00.000Z",
        startedAt: "2026-05-30T10:03:00.000Z",
      }),
      job({
        jobId: "newer",
        createdAt: "2026-05-30T10:04:00.000Z",
      }),
    ],
  );

  assert.deepEqual(merged.map((item) => item.jobId), ["newer", "same", "older"]);
  assert.equal(merged.find((item) => item.jobId === "same")?.status, "completed");
});

test("background job summary is derived from persisted data apply detail", () => {
  const detail: DbDataApplyJobDetailResponse = {
    jobId: "job-1",
    compareId: "compare-1",
    sourceConnectionId: "source",
    targetConnectionId: "target",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-hash",
    status: "partial",
    statusCounts: {
      insert: 1,
      update: 2,
      delete: 0,
      unchanged: 3,
    },
    tableResults: [
      {
        tableName: "employees",
        action: "update",
        attemptedRows: 2,
        succeededRows: 1,
        failedRows: 1,
        error: "one row failed",
      },
      {
        tableName: "employees",
        action: "insert",
        attemptedRows: 1,
        succeededRows: 1,
        failedRows: 0,
      },
      {
        tableName: "departments",
        action: "update",
        attemptedRows: 1,
        succeededRows: 1,
        failedRows: 0,
      },
    ],
    blockers: [{ code: "unsafe_delete_threshold", severity: "warning", message: "review" }],
    sqlPreviewLines: ["UPDATE employees SET full_name = ? WHERE id = ?"],
    previewTruncated: false,
    statementCount: 2,
    createdAt: "2026-05-30T10:00:00.000Z",
    startedAt: "2026-05-30T10:01:00.000Z",
    finishedAt: "2026-05-30T10:02:00.000Z",
  };

  const summary = toBackgroundJobSummary(detail);

  assert.equal(summary.jobKind, "data-apply");
  assert.equal(summary.sourceConnectionId, "source");
  assert.equal(summary.targetConnectionId, "target");
  assert.equal(summary.tableCount, 2);
  assert.equal(summary.primaryTableName, "employees");
  assert.equal(summary.failureSummary, "one row failed");
  assert.equal(summary.statementCount, 2);
});
