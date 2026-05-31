import test from "node:test";
import assert from "node:assert/strict";

import type {
  DbBackgroundJobSummary,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
} from "../../shared/schema";
import { buildWorkbenchSyncJobContext } from "../../client/src/components/extensions/db-workbench/workbench-sync-job-context";

function counts() {
  return {
    insert: 0,
    update: 0,
    delete: 0,
    unchanged: 0,
  };
}

function backgroundJob(
  overrides: Partial<DbBackgroundJobSummary> = {},
): DbBackgroundJobSummary {
  return {
    jobId: "job-1",
    jobKind: "data-apply",
    title: "Data apply users",
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    status: "completed",
    statusCounts: counts(),
    blockers: [],
    tableCount: 1,
    primaryTableName: "users",
    statementCount: 1,
    sqlPreviewLines: [],
    previewTruncated: false,
    createdAt: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

function applyExecute(
  overrides: Partial<DbDataApplyExecuteResponse> = {},
): DbDataApplyExecuteResponse {
  return {
    jobId: "job-execute",
    compareId: "cmp-1",
    targetSnapshotHash: "target-hash-1",
    currentTargetSnapshotHash: "target-hash-2",
    status: "running",
    statusCounts: counts(),
    tableResults: [],
    blockers: [],
    ...overrides,
  };
}

function applyJobDetail(
  overrides: Partial<DbDataApplyJobDetailResponse> = {},
): DbDataApplyJobDetailResponse {
  return {
    jobId: "job-detail",
    compareId: "cmp-1",
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    targetSnapshotHash: "target-hash-1",
    currentTargetSnapshotHash: "target-hash-2",
    status: "completed",
    statusCounts: counts(),
    tableResults: [],
    blockers: [],
    sqlPreviewLines: [],
    previewTruncated: false,
    statementCount: 1,
    createdAt: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

test("sync job context resolves selected and active background jobs explicitly", () => {
  const context = buildWorkbenchSyncJobContext({
    backgroundJobs: [
      backgroundJob({ jobId: "completed", status: "completed" }),
      backgroundJob({ jobId: "pending", status: "pending" }),
      backgroundJob({ jobId: "running", status: "running" }),
    ],
    selectedJobId: "completed",
    applyExecute: null,
    applyJobDetail: null,
  });

  assert.equal(context.selectedBackgroundJob?.jobId, "completed");
  assert.equal(context.activeBackgroundJob?.jobId, "pending");
  assert.equal(context.activeApplyJobId, "pending");
  assert.equal(context.activeApplyJobStatus, "pending");
});

test("sync job context prioritizes the latest execute response as the active job id", () => {
  const context = buildWorkbenchSyncJobContext({
    backgroundJobs: [backgroundJob({ jobId: "running-job", status: "running" })],
    selectedJobId: null,
    applyExecute: applyExecute({ jobId: "execute-job", status: "running" }),
    applyJobDetail: applyJobDetail({ jobId: "detail-job", status: "completed" }),
  });

  assert.equal(context.activeApplyJobId, "execute-job");
  assert.equal(context.activeApplyJobStatus, "running");
});

test("sync job context prefers matching job detail status for the active job", () => {
  const context = buildWorkbenchSyncJobContext({
    backgroundJobs: [],
    selectedJobId: null,
    applyExecute: applyExecute({ jobId: "job-1", status: "running" }),
    applyJobDetail: applyJobDetail({ jobId: "job-1", status: "partial" }),
  });

  assert.equal(context.activeApplyJobId, "job-1");
  assert.equal(context.activeApplyJobStatus, "partial");
});

test("sync job context falls back to matching detail when no execute or active background job exists", () => {
  const context = buildWorkbenchSyncJobContext({
    backgroundJobs: [backgroundJob({ jobId: "old-job", status: "completed" })],
    selectedJobId: "missing",
    applyExecute: null,
    applyJobDetail: applyJobDetail({ jobId: "detail-job", status: "failed" }),
  });

  assert.equal(context.selectedBackgroundJob, null);
  assert.equal(context.activeBackgroundJob, null);
  assert.equal(context.activeApplyJobId, "detail-job");
  assert.equal(context.activeApplyJobStatus, "failed");
});
