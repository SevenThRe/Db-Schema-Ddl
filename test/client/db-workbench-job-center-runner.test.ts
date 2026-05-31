import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "../../shared/schema";
import {
  createJobCenterStateActions,
  runLoadSelectedJobDetail,
  runOpenJobCenterForJob,
  runRefreshBackgroundJobs,
  runReopenSyncContext,
} from "../../client/src/components/extensions/db-workbench/job-center-runner";

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

function detail(jobId = "job-1"): DbDataApplyJobDetailResponse {
  return {
    jobId,
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "hash-1",
    currentTargetSnapshotHash: "hash-1",
    status: "completed",
    statusCounts: {
      insert: 1,
      update: 0,
      delete: 0,
      unchanged: 0,
    },
    tableResults: [],
    blockers: [],
    sqlPreviewLines: [],
    previewTruncated: false,
    statementCount: 1,
    createdAt: "2026-05-30T10:00:00.000Z",
    startedAt: "2026-05-30T10:01:00.000Z",
    finishedAt: "2026-05-30T10:02:00.000Z",
  };
}

test("job center runner refreshes jobs and preserves a still-visible selected job", async () => {
  const events: string[] = [];
  let jobs = [job({ jobId: "old", createdAt: "2026-05-30T10:00:00.000Z" })];
  let selectedJobId: string | null = "old";

  const result = await runRefreshBackgroundJobs({
    preserveIssue: false,
    listBackgroundJobs: async () => ({
      jobs: [
        job({ jobId: "new", createdAt: "2026-05-30T10:02:00.000Z" }),
        job({ jobId: "old", status: "completed", createdAt: "2026-05-30T10:00:00.000Z" }),
      ],
    }),
    beginRefresh: () => events.push("begin"),
    clearIssue: () => events.push("clear-issue"),
    applyJobs: (updater) => {
      jobs = updater(jobs);
      events.push(`jobs:${jobs.map((item) => item.jobId).join(",")}`);
    },
    applySelectedJobId: (updater) => {
      selectedJobId = updater(selectedJobId);
      events.push(`selected:${selectedJobId ?? "none"}`);
    },
    setIssue: (message) => events.push(`issue:${message}`),
    finishRefresh: () => events.push("finish"),
  });

  assert.deepEqual(result?.map((item) => item.jobId), ["new", "old"]);
  assert.equal(selectedJobId, "old");
  assert.deepEqual(events, [
    "begin",
    "clear-issue",
    "jobs:new,old",
    "selected:old",
    "finish",
  ]);
});

test("job center runner selects newest job when current selection disappears", async () => {
  let jobs: DbBackgroundJobSummary[] = [];
  let selectedJobId: string | null = "missing";

  await runRefreshBackgroundJobs({
    preserveIssue: true,
    listBackgroundJobs: async () => ({
      jobs: [
        job({ jobId: "first", createdAt: "2026-05-30T10:01:00.000Z" }),
        job({ jobId: "newest", createdAt: "2026-05-30T10:02:00.000Z" }),
      ],
    }),
    beginRefresh: () => undefined,
    clearIssue: () => assert.fail("preserveIssue should not clear issue"),
    applyJobs: (updater) => {
      jobs = updater(jobs);
    },
    applySelectedJobId: (updater) => {
      selectedJobId = updater(selectedJobId);
    },
    setIssue: () => assert.fail("refresh should not fail"),
    finishRefresh: () => undefined,
  });

  assert.deepEqual(jobs.map((item) => item.jobId), ["newest", "first"]);
  assert.equal(selectedJobId, "newest");
});

test("job center runner reports refresh failures and finalizes", async () => {
  const events: string[] = [];

  const result = await runRefreshBackgroundJobs({
    preserveIssue: false,
    listBackgroundJobs: async () => {
      throw new Error("storage offline");
    },
    beginRefresh: () => events.push("begin"),
    clearIssue: () => events.push("clear-issue"),
    applyJobs: () => assert.fail("failed refresh should not apply jobs"),
    applySelectedJobId: () => assert.fail("failed refresh should not select job"),
    setIssue: (message) => events.push(`issue:${message}`),
    finishRefresh: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "begin",
    "clear-issue",
    "issue:storage offline",
    "finish",
  ]);
});

test("job center runner opens a job detail in the jobs tab", async () => {
  const events: string[] = [];
  const openedDetail = detail("job-1");

  const result = await runOpenJobCenterForJob({
    jobId: "job-1",
    loadJobDetail: async (jobId) => {
      events.push(`load:${jobId}`);
      return openedDetail;
    },
    setSelectedJobId: (jobId) => events.push(`selected:${jobId}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    clearIssue: () => events.push("clear-issue"),
    setIssue: (message) => events.push(`issue:${message}`),
  });

  assert.equal(result, openedDetail);
  assert.deepEqual(events, ["selected:job-1", "tab:jobs", "clear-issue", "load:job-1"]);
});

test("job center runner loads missing selected detail and skips cached selections", async () => {
  const events: string[] = [];
  const loadedDetail = detail("job-2");

  const skipped = await runLoadSelectedJobDetail({
    selectedJobId: "job-1",
    currentDetailJobId: "job-1",
    loadJobDetail: async () => assert.fail("cached detail should not reload"),
    setIssue: (message) => events.push(`issue:${message}`),
  });
  const loaded = await runLoadSelectedJobDetail({
    selectedJobId: "job-2",
    currentDetailJobId: "job-1",
    loadJobDetail: async (jobId) => {
      events.push(`load:${jobId}`);
      return loadedDetail;
    },
    setIssue: (message) => events.push(`issue:${message}`),
  });

  assert.equal(skipped, null);
  assert.equal(loaded, loadedDetail);
  assert.deepEqual(events, ["load:job-2"]);
});

test("job center runner reports selected detail load failures", async () => {
  const events: string[] = [];

  const result = await runLoadSelectedJobDetail({
    selectedJobId: "job-2",
    currentDetailJobId: "job-1",
    loadJobDetail: async () => {
      throw new Error("detail unavailable");
    },
    setIssue: (message) => events.push(`issue:${message}`),
  });

  assert.equal(result, null);
  assert.deepEqual(events, ["issue:detail unavailable"]);
});

test("job center runner reopens sync context from cached or loaded detail", async () => {
  const events: string[] = [];
  const currentDetail = detail("job-1");

  const result = await runReopenSyncContext({
    jobId: "job-1",
    currentDetail,
    loadJobDetail: async () => assert.fail("cached detail should be reused"),
    setSyncSourceConnectionId: (connectionId) => events.push(`source:${connectionId}`),
    setSyncTargetConnectionId: (connectionId) => events.push(`target:${connectionId}`),
    setSelectedJobId: (jobId) => events.push(`selected:${jobId}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setIssue: (message) => events.push(`issue:${message}`),
  });

  assert.equal(result, currentDetail);
  assert.deepEqual(events, [
    "source:source-1",
    "target:target-1",
    "selected:job-1",
    "tab:sync",
  ]);
});

test("job center runner reports sync context restore failures", async () => {
  const events: string[] = [];

  const result = await runReopenSyncContext({
    jobId: "job-2",
    currentDetail: detail("job-1"),
    loadJobDetail: async () => {
      throw new Error("detail missing");
    },
    setSyncSourceConnectionId: () => assert.fail("failed restore should not set source"),
    setSyncTargetConnectionId: () => assert.fail("failed restore should not set target"),
    setSelectedJobId: () => assert.fail("failed restore should not select job"),
    setResultTab: () => assert.fail("failed restore should not switch tab"),
    setIssue: (message) => events.push(`issue:${message}`),
  });

  assert.equal(result, null);
  assert.deepEqual(events, ["issue:detail missing"]);
});

test("job center runner creates reusable state action objects", () => {
  const events: string[] = [];
  let jobs: DbBackgroundJobSummary[] = [];
  let selectedJobId: string | null = null;
  const actions = createJobCenterStateActions({
    setIsRefreshing: (isRefreshing) => events.push(`refreshing:${isRefreshing}`),
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
    updateJobs: (updater) => {
      jobs = updater(jobs);
      events.push(`jobs:${jobs.map((item) => item.jobId).join(",")}`);
    },
    updateSelectedJobId: (updater) => {
      selectedJobId = updater(selectedJobId);
      events.push(`selected:${selectedJobId ?? "none"}`);
    },
    setSelectedJobId: (jobId) => {
      selectedJobId = jobId;
      events.push(`selected-set:${jobId}`);
    },
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setSyncSourceConnectionId: (connectionId) => events.push(`source:${connectionId}`),
    setSyncTargetConnectionId: (connectionId) => events.push(`target:${connectionId}`),
  });

  actions.beginRefresh();
  actions.clearIssue();
  actions.applyJobs(() => [job({ jobId: "job-1" })]);
  actions.applySelectedJobId(() => "job-1");
  actions.setSelectedJobId("job-2");
  actions.setResultTab("jobs");
  actions.setSyncSourceConnectionId("source-1");
  actions.setSyncTargetConnectionId("target-1");
  actions.setIssue("offline");
  actions.finishRefresh();

  assert.deepEqual(events, [
    "refreshing:true",
    "issue:none",
    "jobs:job-1",
    "selected:job-1",
    "selected-set:job-2",
    "tab:jobs",
    "source:source-1",
    "target:target-1",
    "issue:offline",
    "refreshing:false",
  ]);
});
