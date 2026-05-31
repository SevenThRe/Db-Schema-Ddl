import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserDataApplyPollingTimer,
  createDataApplyStateActions,
  formatDataApplyPreviewError,
  runApplyDataApplyExecuteState,
  runApplyDataApplyJobDetailState,
  runBeginDataApplyExecuteState,
  runDataApplyExecute,
  runDataApplyJobDetail,
  runDataApplyPreview,
  runFinishDataApplyExecuteState,
  runMergeDataApplyExecutionDetailState,
  startDataApplyJobPolling,
} from "../../client/src/components/extensions/db-workbench/data-apply-runner";
import type { DataSyncRowDiffEntry } from "../../client/src/components/extensions/db-workbench/data-sync-row-diff";
import type {
  DbDataApplyExecuteRequest,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailRequest,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewRequest,
  DbDataApplyPreviewResponse,
  DbDataDiffPreviewResponse,
} from "../../shared/schema";

function diffPreview(): DbDataDiffPreviewResponse {
  return {
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "target-hash",
    createdAt: "2026-05-31T00:00:00.000Z",
    expiresAt: "2026-05-31T01:00:00.000Z",
    statusCounts: { insert: 0, update: 1, delete: 0, unchanged: 0 },
    tableSummaries: [],
    blockers: [],
  };
}

function diffRows(): DataSyncRowDiffEntry[] {
  return [
    {
      tableName: "users",
      rowKey: { id: 1 },
      rowKeyLabel: "id=1",
      status: "value_changed",
      suggestedAction: "update",
      selectedAction: "update",
      sourceRow: { id: 1, name: "Ada" },
      targetRow: { id: 1, name: "A." },
      fieldDiffs: [],
    },
  ];
}

function applyPreview(): DbDataApplyPreviewResponse {
  return {
    compareId: "compare-1",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    statusCounts: { insert: 0, update: 1, delete: 0, unchanged: 0 },
    sqlPreviewLines: ["UPDATE users SET name = ? WHERE id = ?"],
    previewTruncated: false,
    blockers: [],
    executable: true,
  };
}

function executeResponse(status: DbDataApplyExecuteResponse["status"]): DbDataApplyExecuteResponse {
  return {
    jobId: "job-1",
    compareId: "compare-1",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    status,
    statusCounts: { insert: 0, update: 1, delete: 0, unchanged: 0 },
    tableResults: [],
    blockers: [],
  };
}

function jobDetail(status: DbDataApplyJobDetailResponse["status"]): DbDataApplyJobDetailResponse {
  return {
    jobId: "job-1",
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    status,
    statusCounts: { insert: 0, update: 1, delete: 0, unchanged: 0 },
    tableResults: [],
    blockers: [],
    sqlPreviewLines: [],
    previewTruncated: false,
    statementCount: 1,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:01.000Z",
  };
}

test("data apply runner previews selected row actions", async () => {
  const requests: DbDataApplyPreviewRequest[] = [];
  const events: string[] = [];

  const result = await runDataApplyPreview({
    diffPreview: diffPreview(),
    currentTargetSnapshotHash: "target-current",
    diffRows: diffRows(),
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    deleteWarningThreshold: 500,
    previewDataApply: async (request) => {
      requests.push(request);
      return applyPreview();
    },
    beginPreview: () => events.push("begin"),
    applyPreview: (preview) => events.push(`preview:${preview.compareId}`),
    finishPreview: () => events.push("finish"),
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
  });

  assert.equal(result?.compareId, "compare-1");
  assert.deepEqual(requests[0], {
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    selections: [
      {
        tableName: "users",
        rowKey: { id: 1 },
        action: "update",
      },
    ],
    deleteWarningThreshold: 500,
  });
  assert.deepEqual(events, ["begin", "preview:compare-1", "finish"]);
});

test("data apply runner rejects missing preview or selected actions before backend calls", async () => {
  const issues: Array<string | null> = [];
  const missingCompare = await runDataApplyPreview({
    diffPreview: null,
    currentTargetSnapshotHash: undefined,
    diffRows: diffRows(),
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    deleteWarningThreshold: 500,
    previewDataApply: async () => assert.fail("previewDataApply should not run"),
    beginPreview: () => assert.fail("beginPreview should not run"),
    applyPreview: () => assert.fail("applyPreview should not run"),
    finishPreview: () => assert.fail("finishPreview should not run"),
    setIssue: (message) => issues.push(message),
  });
  const noSelection = await runDataApplyExecute({
    diffPreview: diffPreview(),
    applyPreview: applyPreview(),
    diffRows: [],
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    deleteWarningThreshold: 500,
    confirmUnsafeDelete: false,
    targetDatabaseConfirmation: "",
    executeDataApply: async () => assert.fail("executeDataApply should not run"),
    loadJobDetail: async () => assert.fail("loadJobDetail should not run"),
    refreshBackgroundJobs: async () => assert.fail("refreshBackgroundJobs should not run"),
    showNotification: () => assert.fail("showNotification should not run"),
    beginExecute: () => assert.fail("beginExecute should not run"),
    applyExecute: () => assert.fail("applyExecute should not run"),
    applyExecutionDetail: () => assert.fail("applyExecutionDetail should not run"),
    finishExecute: () => assert.fail("finishExecute should not run"),
    setIssue: (message) => issues.push(message),
  });

  assert.equal(missingCompare, null);
  assert.equal(noSelection, null);
  assert.deepEqual(issues, [
    "Run compare preview first.",
    "No row actions are selected for apply execution.",
  ]);
});

test("data apply runner loads job detail with background summary", async () => {
  const requests: DbDataApplyJobDetailRequest[] = [];
  let appliedJobId: string | null = null;
  let summaryStatus: string | null = null;

  const detail = await runDataApplyJobDetail({
    jobId: "job-1",
    fetchDataApplyJobDetail: async (request) => {
      requests.push(request);
      return jobDetail("running");
    },
    applyDetail: ({ detail: loadedDetail, jobSummary }) => {
      appliedJobId = loadedDetail.jobId;
      summaryStatus = jobSummary.status;
    },
  });

  assert.equal(detail.jobId, "job-1");
  assert.deepEqual(requests, [{ jobId: "job-1" }]);
  assert.equal(appliedJobId, "job-1");
  assert.equal(summaryStatus, "running");
});

test("data apply runner centralizes execute and detail UI state", () => {
  const events: string[] = [];
  let currentExecute: DbDataApplyExecuteResponse | null = executeResponse("running");

  runBeginDataApplyExecuteState({
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
  });
  runApplyDataApplyExecuteState({
    result: executeResponse("running"),
    setApplyExecute: (result) => events.push(`execute:${result.status}`),
    setSelectedJobId: (jobId) => events.push(`selected:${jobId}`),
  });
  runMergeDataApplyExecutionDetailState({
    detail: jobDetail("completed"),
    options: { refreshCurrentTargetSnapshotHash: false },
    updateApplyExecute: (updater) => {
      currentExecute = updater(currentExecute);
      events.push(`merged:${currentExecute?.status}`);
    },
  });
  runFinishDataApplyExecuteState({
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
  });

  assert.equal(currentExecute?.status, "completed");
  assert.deepEqual(events, [
    "executing:true",
    "issue:none",
    "execute:running",
    "selected:job-1",
    "merged:completed",
    "executing:false",
  ]);
});

test("data apply runner applies job detail into detail, background, and execute state", () => {
  const events: string[] = [];
  let currentExecute: DbDataApplyExecuteResponse | null = executeResponse("running");

  runApplyDataApplyJobDetailState({
    detail: jobDetail("completed"),
    jobSummary: {
      jobId: "job-1",
      kind: "data-apply",
      status: "completed",
      title: "Data Sync apply",
      description: "target-1",
      updatedAt: "2026-05-31T00:00:01.000Z",
    },
    setApplyJobDetail: (detail) => events.push(`detail:${detail.status}`),
    updateBackgroundJobs: (updater) => {
      const jobs = updater([]);
      events.push(`jobs:${jobs[0]?.status}`);
    },
    updateApplyExecute: (updater) => {
      currentExecute = updater(currentExecute);
      events.push(`execute:${currentExecute?.status}`);
    },
  });

  assert.equal(currentExecute?.status, "completed");
  assert.deepEqual(events, [
    "detail:completed",
    "jobs:completed",
    "execute:completed",
  ]);
});

test("data apply runner creates reusable state action objects", () => {
  const events: string[] = [];
  let currentExecute: DbDataApplyExecuteResponse | null = executeResponse("running");
  const actions = createDataApplyStateActions({
    setIsPreviewing: (isPreviewing) => events.push(`previewing:${isPreviewing}`),
    setApplyPreview: (preview) => events.push(`preview:${preview.compareId}`),
    setApplyUnsafeDeleteConfirmed: (confirmed) => events.push(`unsafe:${confirmed}`),
    setApplyProdConfirmation: (confirmation) => events.push(`prod:${confirmation}`),
    setResultTab: () => events.push("tab:sync"),
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
    setApplyExecute: (result) => events.push(`execute:${result.status}`),
    updateApplyExecute: (updater) => {
      currentExecute = updater(currentExecute);
      events.push(`merged:${currentExecute?.status}`);
    },
    setSelectedJobId: (jobId) => events.push(`selected:${jobId}`),
    setApplyJobDetail: (detail) => events.push(`detail:${detail.status}`),
    updateBackgroundJobs: (updater) => {
      const jobs = updater([]);
      events.push(`jobs:${jobs[0]?.status}`);
    },
  });

  actions.beginPreview();
  actions.applyPreview(applyPreview());
  actions.finishPreview();
  actions.beginExecute();
  actions.applyExecute(executeResponse("running"));
  actions.applyExecutionDetail(jobDetail("completed"), {
    refreshCurrentTargetSnapshotHash: false,
  });
  actions.applySelectedJobDetail({
    detail: jobDetail("completed"),
    jobSummary: {
      jobId: "job-1",
      kind: "data-apply",
      status: "completed",
      title: "Data Sync apply",
      description: "target-1",
      updatedAt: "2026-05-31T00:00:01.000Z",
    },
  });
  actions.setUnsafeDeleteConfirmed(true);
  actions.setProdConfirmation("target_prod");
  actions.finishExecute();

  assert.equal(currentExecute?.status, "completed");
  assert.deepEqual(events, [
    "previewing:true",
    "issue:none",
    "unsafe:false",
    "tab:sync",
    "preview:compare-1",
    "previewing:false",
    "executing:true",
    "issue:none",
    "execute:running",
    "selected:job-1",
    "merged:completed",
    "detail:completed",
    "jobs:completed",
    "merged:completed",
    "selected:job-1",
    "unsafe:true",
    "prod:target_prod",
    "executing:false",
  ]);
});

test("data apply runner executes, refreshes job detail, and notifies operator", async () => {
  const requests: DbDataApplyExecuteRequest[] = [];
  const events: string[] = [];

  const result = await runDataApplyExecute({
    diffPreview: diffPreview(),
    applyPreview: applyPreview(),
    diffRows: diffRows(),
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    deleteWarningThreshold: 500,
    confirmUnsafeDelete: true,
    targetDatabaseConfirmation: " prod_db ",
    executeDataApply: async (request) => {
      requests.push(request);
      events.push("execute");
      return executeResponse("running");
    },
    loadJobDetail: async (jobId) => {
      events.push(`detail:${jobId}`);
      return jobDetail("completed");
    },
    refreshBackgroundJobs: async (preserveIssue) => {
      events.push(`refresh:${preserveIssue}`);
    },
    showNotification: (notification) => {
      events.push(`notice:${notification.title}`);
    },
    beginExecute: () => events.push("begin"),
    applyExecute: (response) => events.push(`apply:${response.status}`),
    applyExecutionDetail: (detail, options) => {
      events.push(
        `merge:${detail.status}:${options?.refreshCurrentTargetSnapshotHash}`,
      );
    },
    finishExecute: () => events.push("finish"),
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
  });

  assert.equal(result?.jobId, "job-1");
  assert.deepEqual(requests[0], {
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    selections: [
      {
        tableName: "users",
        rowKey: { id: 1 },
        action: "update",
      },
    ],
    deleteWarningThreshold: 500,
    confirmUnsafeDelete: true,
    targetDatabaseConfirmation: "prod_db",
  });
  assert.deepEqual(events, [
    "begin",
    "execute",
    "apply:running",
    "detail:job-1",
    "refresh:true",
    "notice:Data Sync apply started",
    "merge:completed:false",
    "finish",
  ]);
});

test("data apply runner centralizes preview and execute error formatting", async () => {
  const events: string[] = [];

  assert.equal(
    formatDataApplyPreviewError(new Error("Error invoking preview: denied")),
    "denied",
  );

  const result = await runDataApplyExecute({
    diffPreview: diffPreview(),
    applyPreview: applyPreview(),
    diffRows: diffRows(),
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    deleteWarningThreshold: 500,
    confirmUnsafeDelete: false,
    targetDatabaseConfirmation: "",
    executeDataApply: async () => {
      throw new Error("Error invoking apply: blocked");
    },
    loadJobDetail: async () => assert.fail("loadJobDetail should not run"),
    refreshBackgroundJobs: async () => assert.fail("refreshBackgroundJobs should not run"),
    showNotification: () => assert.fail("showNotification should not run"),
    beginExecute: () => events.push("begin"),
    applyExecute: () => assert.fail("applyExecute should not run"),
    applyExecutionDetail: () => assert.fail("applyExecutionDetail should not run"),
    finishExecute: () => events.push("finish"),
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
  });

  assert.equal(result, null);
  assert.deepEqual(events, ["begin", "issue:blocked", "finish"]);
});

test("data apply job polling schedules active jobs and emits terminal notification", async () => {
  const events: string[] = [];
  const timers: Array<{ id: number; callback: () => void | Promise<void>; delay: number }> = [];

  const stop = startDataApplyJobPolling({
    activeJobId: "job-1",
    activeJobStatus: "running",
    fetchDataApplyJobDetail: async () => jobDetail("completed"),
    applyPolledDetail: ({ detail, jobSummary }) => {
      events.push(`detail:${detail.status}:${jobSummary.status}`);
    },
    refreshBackgroundJobs: async (preserveIssue) => {
      events.push(`refresh:${preserveIssue}`);
    },
    showNotification: (notification) => {
      events.push(`notice:${notification.title}`);
    },
    setIssue: (message) => events.push(`issue:${message}`),
    setTimer: (callback, delay) => {
      const id = timers.length + 1;
      timers.push({ id, callback, delay });
      return id;
    },
    clearTimer: (timerId) => events.push(`clear:${timerId}`),
  });

  assert.equal(typeof stop, "function");
  assert.equal(timers[0]?.delay, 1500);
  await timers[0]?.callback();
  assert.deepEqual(events, [
    "detail:completed:completed",
    "refresh:true",
    "notice:Data Sync apply completed",
  ]);
});

test("data apply job polling reschedules running jobs and retries failures", async () => {
  const events: string[] = [];
  const timers: Array<{ id: number; callback: () => void | Promise<void>; delay: number }> = [];
  let attempt = 0;

  startDataApplyJobPolling({
    activeJobId: "job-1",
    activeJobStatus: "pending",
    fetchDataApplyJobDetail: async () => {
      attempt += 1;
      if (attempt === 1) {
        return jobDetail("running");
      }
      throw new Error("Error invoking detail: offline");
    },
    applyPolledDetail: ({ detail }) => events.push(`detail:${detail.status}`),
    refreshBackgroundJobs: async () => events.push("refresh"),
    showNotification: (notification) => events.push(`notice:${notification.title}`),
    setIssue: (message) => events.push(`issue:${message}`),
    setTimer: (callback, delay) => {
      const id = timers.length + 1;
      timers.push({ id, callback, delay });
      events.push(`timer:${delay}`);
      return id;
    },
    clearTimer: (timerId) => events.push(`clear:${timerId}`),
  });

  await timers[0]?.callback();
  await timers[1]?.callback();

  assert.deepEqual(events, [
    "timer:1500",
    "detail:running",
    "refresh",
    "timer:1500",
    "issue:offline",
    "timer:3000",
  ]);
});

test("data apply job polling does not start inactive jobs and cleanup clears timer", () => {
  const skipped = startDataApplyJobPolling({
    activeJobId: "job-1",
    activeJobStatus: "completed",
    fetchDataApplyJobDetail: async () => assert.fail("fetch should not run"),
    applyPolledDetail: () => assert.fail("apply should not run"),
    refreshBackgroundJobs: async () => assert.fail("refresh should not run"),
    showNotification: () => assert.fail("notify should not run"),
    setIssue: () => assert.fail("issue should not run"),
    setTimer: () => assert.fail("timer should not run"),
    clearTimer: () => assert.fail("clear should not run"),
  });
  const events: string[] = [];
  const stop = startDataApplyJobPolling({
    activeJobId: "job-1",
    activeJobStatus: "running",
    fetchDataApplyJobDetail: async () => jobDetail("running"),
    applyPolledDetail: () => undefined,
    refreshBackgroundJobs: async () => undefined,
    showNotification: () => undefined,
    setIssue: () => undefined,
    setTimer: () => 42,
    clearTimer: (timerId) => events.push(`clear:${timerId}`),
  });

  assert.equal(skipped, null);
  stop?.();
  assert.deepEqual(events, ["clear:42"]);
});

test("data apply polling timer adapter owns browser timer wiring", () => {
  const events: string[] = [];
  Reflect.set(globalThis, "window", {
    setTimeout: (callback: () => void, delayMs: number) => {
      events.push(`timer:${delayMs}`);
      callback();
      return 7;
    },
    clearTimeout: (timerId: number) => {
      events.push(`clear:${timerId}`);
    },
  });

  try {
    const timer = createBrowserDataApplyPollingTimer();
    const timerId = timer.setTimer(() => {
      events.push("callback");
    }, 250);
    timer.clearTimer(timerId);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }

  assert.deepEqual(events, ["timer:250", "callback", "clear:7"]);
});
