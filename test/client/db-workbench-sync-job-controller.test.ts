import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchSyncJobController,
} from "../../client/src/components/extensions/db-workbench/workbench-sync-job-controller";
import type {
  DbBackgroundJobSummary,
  DbDataApplyExecuteRequest,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
} from "../../shared/schema";
import type { DataSyncRowDiffEntry } from "../../client/src/components/extensions/db-workbench/data-sync-row-diff";
import type {
  SyncTableConfigDraft,
} from "../../client/src/components/extensions/db-workbench/data-sync-utils";

function counts() {
  return {
    insert: 0,
    update: 1,
    delete: 0,
    unchanged: 0,
  };
}

function diffPreview(
  overrides: Partial<DbDataDiffPreviewResponse> = {},
): DbDataDiffPreviewResponse {
  return {
    compareId: "cmp-1",
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    targetSnapshotHash: "target-hash-1",
    createdAt: "2026-05-31T00:00:00.000Z",
    expiresAt: "2026-05-31T01:00:00.000Z",
    statusCounts: counts(),
    tableSummaries: [
      {
        tableName: "users",
        keyColumns: ["id"],
        compareColumns: ["name"],
        statusCounts: counts(),
        blocked: false,
        blockerCodes: [],
        sampleRows: [],
      },
    ],
    blockers: [],
    ...overrides,
  };
}

function diffDetail(
  overrides: Partial<DbDataDiffDetailResponse> = {},
): DbDataDiffDetailResponse {
  return {
    compareId: "cmp-1",
    tableName: "users",
    targetSnapshotHash: "target-hash-1",
    currentTargetSnapshotHash: "target-hash-2",
    keyColumns: ["id"],
    compareColumns: ["name"],
    rows: [
      {
        tableName: "users",
        rowKey: { id: 1 },
        status: "value_changed",
        suggestedAction: "update",
        sourceRow: { id: 1, name: "Ada" },
        targetRow: { id: 1, name: "A." },
        fieldDiffs: [
          {
            columnName: "name",
            sourceValue: "Ada",
            targetValue: "A.",
            changed: true,
          },
        ],
      },
    ],
    hasMore: false,
    blockers: [],
    ...overrides,
  };
}

function applyPreview(
  overrides: Partial<DbDataApplyPreviewResponse> = {},
): DbDataApplyPreviewResponse {
  return {
    compareId: "cmp-1",
    targetSnapshotHash: "target-hash-1",
    currentTargetSnapshotHash: "target-hash-2",
    statusCounts: counts(),
    sqlPreviewLines: ["update users set name = ? where id = ?"],
    previewTruncated: false,
    blockers: [],
    executable: true,
    ...overrides,
  };
}

function applyExecute(
  overrides: Partial<DbDataApplyExecuteResponse> = {},
): DbDataApplyExecuteResponse {
  return {
    jobId: "job-1",
    compareId: "cmp-1",
    targetSnapshotHash: "target-hash-1",
    currentTargetSnapshotHash: "target-hash-2",
    status: "completed",
    statusCounts: counts(),
    tableResults: [],
    blockers: [],
    ...overrides,
  };
}

function jobDetail(
  overrides: Partial<DbDataApplyJobDetailResponse> = {},
): DbDataApplyJobDetailResponse {
  return {
    jobId: "job-1",
    compareId: "cmp-1",
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    targetSnapshotHash: "target-hash-1",
    currentTargetSnapshotHash: "target-hash-2",
    status: "completed",
    statusCounts: counts(),
    tableResults: [],
    blockers: [],
    sqlPreviewLines: ["update users set name = ? where id = ?"],
    previewTruncated: false,
    statementCount: 1,
    createdAt: "2026-05-31T00:00:00.000Z",
    startedAt: "2026-05-31T00:00:01.000Z",
    finishedAt: "2026-05-31T00:00:02.000Z",
    ...overrides,
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

function row(): DataSyncRowDiffEntry {
  return {
    tableName: "users",
    rowKey: { id: 1 },
    status: "value_changed",
    suggestedAction: "update",
  };
}

test("sync job controller centralizes compare detail and draft commands", async () => {
  const events: string[] = [];
  const previewRequests: unknown[] = [];
  const detailRequests: unknown[] = [];
  let selectedTables = ["users"];
  let tableConfigs: Record<string, SyncTableConfigDraft> = {};
  let rows = [row()];

  const controller = createWorkbenchSyncJobController({
    isSyncSchemaLoading: false,
    syncSchemaIssueMessage: null,
    syncSelectedTables: selectedTables,
    selectedTableName: null,
    syncTableConfigs: tableConfigs,
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    includeUnchanged: false,
    diffPreview: diffPreview(),
    diffDetail: null,
    diffRows: rows,
    applyPreview: null,
    applyUnsafeDeleteConfirmed: false,
    applyProdConfirmation: "",
    applyJobDetail: null,
    selectedJobId: null,
    activeApplyJobId: null,
    activeApplyJobStatus: null,
    deleteWarningThreshold: 500,
    dataDiffActions: {
      setIssue: (message) => events.push(`diff-issue:${message ?? "null"}`),
      beginPreview: () => events.push("diff-begin"),
      applyPreview: () => events.push("diff-preview"),
      applyDetail: ({ rows: detailRows }) => {
        rows = detailRows;
        events.push(`detail:${detailRows.length}`);
      },
      selectRow: (index) => events.push(`select:${index}`),
      clearArtifacts: () => events.push("clear"),
      finishPreview: () => events.push("diff-finish"),
    },
    dataApplyActions: {} as never,
    dataSyncDraftActions: {
      updateSelectedTables: (updater) => {
        selectedTables = updater(selectedTables);
      },
      updateTableConfigs: (updater) => {
        tableConfigs = updater(tableConfigs);
      },
      updateRows: (updater) => {
        rows = updater(rows);
      },
      setIncludeUnchanged: (include) => events.push(`include:${include}`),
      clearApplyArtifacts: () => events.push("clear-apply"),
    },
    jobCenterActions: {} as never,
    fetchDataDiffDetail: async (request) => {
      detailRequests.push(request);
      return diffDetail();
    },
    previewDataDiff: async (request) => {
      previewRequests.push(request);
      return diffPreview();
    },
    previewDataApply: async () => assert.fail("previewDataApply should not run"),
    executeDataApply: async () => assert.fail("executeDataApply should not run"),
    fetchDataApplyJobDetail: async () => assert.fail("job detail should not run"),
    listBackgroundJobs: async () => assert.fail("listBackgroundJobs should not run"),
    showNotification: () => undefined,
    setSyncIssue: (message) => events.push(`sync-issue:${message ?? "null"}`),
    createPollingTimer: () => assert.fail("polling should not start"),
  });

  controller.handleSyncTableConfigChange("users", "whereClause", "id > 0");
  controller.handleToggleSyncTable("orders");
  controller.handleChangeSyncRowAction(0, "ignore");
  assert.equal(rows[0]?.suggestedAction, "ignore");
  await controller.handlePreviewDataDiff();

  assert.deepEqual(selectedTables, ["users", "orders"]);
  assert.equal(tableConfigs.users?.whereClause, "id > 0");
  assert.equal(rows[0]?.suggestedAction, "update");
  assert.deepEqual(previewRequests, [
    {
      sourceConnectionId: "src-1",
      targetConnectionId: "tgt-1",
      tables: [
        {
          tableName: "users",
          keyColumns: undefined,
          compareColumns: undefined,
          whereClause: undefined,
        },
      ],
    },
  ]);
  assert.deepEqual(detailRequests, [
    {
      compareId: "cmp-1",
      tableName: "users",
      limit: 200,
      offset: 0,
      includeUnchanged: false,
    },
  ]);
  assert.deepEqual(events, [
    "clear-apply",
    "diff-begin",
    "diff-preview",
    "diff-finish",
    "detail:1",
  ]);
});

test("sync job controller routes apply preview and execute through job detail and refresh", async () => {
  const events: string[] = [];
  const previewRequests: unknown[] = [];
  const executeRequests: DbDataApplyExecuteRequest[] = [];
  let selectedJobId: string | null = null;

  const controller = createWorkbenchSyncJobController({
    isSyncSchemaLoading: false,
    syncSchemaIssueMessage: null,
    syncSelectedTables: ["users"],
    selectedTableName: null,
    syncTableConfigs: {},
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    includeUnchanged: false,
    diffPreview: diffPreview(),
    diffDetail: diffDetail(),
    diffRows: [row()],
    applyPreview: applyPreview(),
    applyUnsafeDeleteConfirmed: true,
    applyProdConfirmation: "prod_db",
    applyJobDetail: null,
    selectedJobId,
    activeApplyJobId: null,
    activeApplyJobStatus: null,
    deleteWarningThreshold: 500,
    dataDiffActions: {} as never,
    dataApplyActions: {
      beginPreview: () => events.push("apply-preview-begin"),
      applyPreview: () => events.push("apply-preview"),
      finishPreview: () => events.push("apply-preview-finish"),
      beginExecute: () => events.push("execute-begin"),
      applyExecute: (result) => {
        selectedJobId = result.jobId;
        events.push(`execute:${result.jobId}`);
      },
      applyExecutionDetail: () => events.push("merge-detail"),
      finishExecute: () => events.push("execute-finish"),
      applyJobDetail: () => events.push("job-detail"),
      applySelectedJobDetail: () => events.push("selected-detail"),
      setUnsafeDeleteConfirmed: () => undefined,
      setProdConfirmation: () => undefined,
    },
    dataSyncDraftActions: {} as never,
    jobCenterActions: {
      beginRefresh: () => events.push("jobs-refresh-begin"),
      clearIssue: () => events.push("jobs-clear"),
      applyJobs: () => events.push("jobs-apply"),
      applySelectedJobId: () => events.push("jobs-select"),
      setSelectedJobId: (jobId) => {
        selectedJobId = jobId;
      },
      setResultTab: () => undefined,
      setSyncSourceConnectionId: () => undefined,
      setSyncTargetConnectionId: () => undefined,
      setIssue: (message) => events.push(`jobs-issue:${message}`),
      finishRefresh: () => events.push("jobs-refresh-finish"),
    },
    fetchDataDiffDetail: async () => assert.fail("detail should not run"),
    previewDataDiff: async () => assert.fail("previewDataDiff should not run"),
    previewDataApply: async (request) => {
      previewRequests.push(request);
      return applyPreview();
    },
    executeDataApply: async (request) => {
      executeRequests.push(request);
      return applyExecute();
    },
    fetchDataApplyJobDetail: async () => jobDetail(),
    listBackgroundJobs: async () => ({ jobs: [backgroundJob()] }),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    setSyncIssue: (message) => events.push(`sync-issue:${message ?? "null"}`),
    createPollingTimer: () => assert.fail("polling should not start"),
  });

  await controller.handlePreviewDataApply();
  await controller.handleExecuteDataApply();

  assert.equal(previewRequests.length, 1);
  assert.equal(executeRequests[0]?.confirmUnsafeDelete, true);
  assert.equal(executeRequests[0]?.targetDatabaseConfirmation, "prod_db");
  assert.deepEqual(executeRequests[0]?.selections, [
    {
      tableName: "users",
      rowKey: { id: 1 },
      action: "update",
    },
  ]);
  assert.equal(selectedJobId, "job-1");
  assert.deepEqual(events, [
    "apply-preview-begin",
    "apply-preview",
    "apply-preview-finish",
    "execute-begin",
    "execute:job-1",
    "selected-detail",
    "jobs-refresh-begin",
    "jobs-apply",
    "jobs-select",
    "jobs-refresh-finish",
    "notice:Data Sync apply completed",
    "execute-finish",
  ]);
});

test("sync job controller centralizes job center refresh, selection, and sync-context reopen", async () => {
  const events: string[] = [];
  let selectedJobId: string | null = null;
  let sourceConnectionId = "";
  let targetConnectionId = "";

  const controller = createWorkbenchSyncJobController({
    isSyncSchemaLoading: false,
    syncSchemaIssueMessage: null,
    syncSelectedTables: ["users"],
    selectedTableName: null,
    syncTableConfigs: {},
    sourceConnectionId: "src-1",
    targetConnectionId: "tgt-1",
    includeUnchanged: false,
    diffPreview: null,
    diffDetail: null,
    diffRows: [],
    applyPreview: null,
    applyUnsafeDeleteConfirmed: false,
    applyProdConfirmation: "",
    applyJobDetail: null,
    selectedJobId: "job-1",
    activeApplyJobId: null,
    activeApplyJobStatus: null,
    deleteWarningThreshold: 500,
    dataDiffActions: {} as never,
    dataApplyActions: {
      applySelectedJobDetail: () => events.push("selected-detail"),
      applyJobDetail: () => events.push("job-detail"),
    } as never,
    dataSyncDraftActions: {} as never,
    jobCenterActions: {
      beginRefresh: () => events.push("jobs-refresh-begin"),
      clearIssue: () => events.push("jobs-clear"),
      applyJobs: () => events.push("jobs-apply"),
      applySelectedJobId: () => events.push("jobs-select"),
      setSelectedJobId: (jobId) => {
        selectedJobId = jobId;
        events.push(`selected:${jobId}`);
      },
      setResultTab: (tab) => events.push(`tab:${tab}`),
      setSyncSourceConnectionId: (connectionId) => {
        sourceConnectionId = connectionId;
      },
      setSyncTargetConnectionId: (connectionId) => {
        targetConnectionId = connectionId;
      },
      setIssue: (message) => events.push(`jobs-issue:${message}`),
      finishRefresh: () => events.push("jobs-refresh-finish"),
    },
    fetchDataDiffDetail: async () => assert.fail("detail should not run"),
    previewDataDiff: async () => assert.fail("previewDataDiff should not run"),
    previewDataApply: async () => assert.fail("previewDataApply should not run"),
    executeDataApply: async () => assert.fail("executeDataApply should not run"),
    fetchDataApplyJobDetail: async () => jobDetail(),
    listBackgroundJobs: async () => ({ jobs: [backgroundJob()] }),
    showNotification: () => undefined,
    setSyncIssue: (message) => events.push(`sync-issue:${message ?? "null"}`),
    createPollingTimer: () => assert.fail("polling should not start"),
  });

  await controller.refreshBackgroundJobs();
  await controller.handleLoadSelectedJobDetail();
  await controller.handleOpenJobCenterForJob("job-1");
  await controller.handleReopenSyncContext("job-1");

  assert.equal(selectedJobId, "job-1");
  assert.equal(sourceConnectionId, "src-1");
  assert.equal(targetConnectionId, "tgt-1");
  assert.deepEqual(events, [
    "jobs-refresh-begin",
    "jobs-clear",
    "jobs-apply",
    "jobs-select",
    "jobs-refresh-finish",
    "selected-detail",
    "selected:job-1",
    "tab:jobs",
    "jobs-clear",
    "selected-detail",
    "selected-detail",
    "selected:job-1",
    "tab:sync",
  ]);
});
