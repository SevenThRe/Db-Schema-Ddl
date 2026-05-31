import type {
  DbBackgroundJobListRequest,
  DbBackgroundJobListResponse,
  DbBackgroundJobSummary,
  DbDataApplyExecuteRequest,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailRequest,
  DbDataApplyJobDetailResponse,
  DbDataApplyJobStatus,
  DbDataApplyPreviewRequest,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailRequest,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewRequest,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import type { ToastOptions } from "@/extensions/host-api";
import type {
  DataSyncRowDiffEntry,
  DataSyncSuggestedAction,
} from "./data-sync-row-diff";
import {
  runDataApplyExecute,
  runDataApplyJobDetail,
  runDataApplyPreview,
  startDataApplyJobPolling,
  type DataApplyStateActions,
  type StartDataApplyJobPollingInput,
} from "./data-apply-runner";
import {
  runChangeSyncRowAction,
  runSyncTableConfigChange,
  runToggleIncludeUnchangedRows,
  runToggleSyncTable,
  type DataSyncDraftActions,
} from "./data-sync-draft-runner";
import {
  runDataDiffDetail,
  runDataDiffPreview,
  type DataDiffStateActions,
} from "./data-sync-runner";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import {
  runLoadSelectedJobDetail,
  runOpenJobCenterForJob,
  runRefreshBackgroundJobs,
  runReopenSyncContext,
  type JobCenterStateActions,
} from "./job-center-runner";

export interface WorkbenchSyncJobController {
  handleLoadDataDiffDetail: (
    tableName: string,
    includeUnchanged?: boolean,
  ) => Promise<DbDataDiffDetailResponse | null>;
  handleSyncTableConfigChange: (
    tableName: string,
    field: keyof SyncTableConfigDraft,
    value: string,
  ) => void;
  handlePreviewDataDiff: () => Promise<void>;
  handlePreviewDataApply: () => Promise<void>;
  handleLoadDataApplyJobDetail: (
    jobId: string,
  ) => Promise<DbDataApplyJobDetailResponse>;
  refreshBackgroundJobs: (preserveIssue?: boolean) => Promise<void>;
  handleLoadSelectedJobDetail: () => Promise<DbDataApplyJobDetailResponse | null>;
  handleOpenJobCenterForJob: (
    jobId: string,
  ) => Promise<DbDataApplyJobDetailResponse | null>;
  handleReopenSyncContext: (
    jobId: string,
  ) => Promise<DbDataApplyJobDetailResponse | null>;
  handleExecuteDataApply: () => Promise<void>;
  startApplyJobPolling: () => (() => void) | undefined;
  handleToggleSyncTable: (tableName: string) => void;
  handleChangeSyncRowAction: (
    rowIndex: number,
    nextAction: DataSyncSuggestedAction,
  ) => void;
  handleToggleIncludeUnchangedRows: (nextIncludeUnchanged: boolean) => void;
}

export function createWorkbenchSyncJobController(input: {
  isSyncSchemaLoading: boolean;
  syncSchemaIssueMessage: string | null;
  syncSelectedTables: string[];
  selectedTableName: string | null;
  syncTableConfigs: Record<string, SyncTableConfigDraft>;
  sourceConnectionId: string;
  targetConnectionId: string;
  includeUnchanged: boolean;
  diffPreview: DbDataDiffPreviewResponse | null;
  diffDetail: DbDataDiffDetailResponse | null;
  diffRows: DataSyncRowDiffEntry[];
  applyPreview: DbDataApplyPreviewResponse | null;
  applyUnsafeDeleteConfirmed: boolean;
  applyProdConfirmation: string;
  applyJobDetail: DbDataApplyJobDetailResponse | null;
  selectedJobId: string | null;
  activeApplyJobId: string | null;
  activeApplyJobStatus: DbDataApplyJobStatus | null;
  deleteWarningThreshold: number;
  dataDiffActions: DataDiffStateActions;
  dataApplyActions: DataApplyStateActions;
  dataSyncDraftActions: DataSyncDraftActions;
  jobCenterActions: JobCenterStateActions;
  fetchDataDiffDetail: (
    request: DbDataDiffDetailRequest,
  ) => Promise<DbDataDiffDetailResponse>;
  previewDataDiff: (
    request: DbDataDiffPreviewRequest,
  ) => Promise<DbDataDiffPreviewResponse>;
  previewDataApply: (
    request: DbDataApplyPreviewRequest,
  ) => Promise<DbDataApplyPreviewResponse>;
  executeDataApply: (
    request: DbDataApplyExecuteRequest,
  ) => Promise<DbDataApplyExecuteResponse>;
  fetchDataApplyJobDetail: (
    request: DbDataApplyJobDetailRequest,
  ) => Promise<DbDataApplyJobDetailResponse>;
  listBackgroundJobs: (
    request: DbBackgroundJobListRequest,
  ) => Promise<DbBackgroundJobListResponse>;
  showNotification: (notification: ToastOptions) => void;
  setSyncIssue: (message: string | null) => void;
  createPollingTimer: () => Pick<
    StartDataApplyJobPollingInput,
    "setTimer" | "clearTimer"
  >;
}): WorkbenchSyncJobController {
  const handleLoadDataDiffDetail = (
    tableName: string,
    includeUnchanged = input.includeUnchanged,
  ) =>
    runDataDiffDetail({
      compareId: input.diffPreview?.compareId,
      tableName,
      includeUnchanged,
      fetchDataDiffDetail: input.fetchDataDiffDetail,
      applyDetail: input.dataDiffActions.applyDetail,
      setIssue: input.dataDiffActions.setIssue,
    });

  const handleLoadDataApplyJobDetail = (jobId: string) =>
    runDataApplyJobDetail({
      jobId,
      fetchDataApplyJobDetail: input.fetchDataApplyJobDetail,
      applyDetail: ({ detail, jobSummary }) => {
        input.dataApplyActions.applySelectedJobDetail({
          detail,
          jobSummary,
        });
      },
    });

  const refreshBackgroundJobs = async (preserveIssue = false) => {
    await runRefreshBackgroundJobs({
      preserveIssue,
      listBackgroundJobs: () => input.listBackgroundJobs({ limit: 30 }),
      beginRefresh: input.jobCenterActions.beginRefresh,
      clearIssue: input.jobCenterActions.clearIssue,
      applyJobs: input.jobCenterActions.applyJobs,
      applySelectedJobId: input.jobCenterActions.applySelectedJobId,
      setIssue: input.jobCenterActions.setIssue,
      finishRefresh: input.jobCenterActions.finishRefresh,
    });
  };

  return {
    handleLoadDataDiffDetail,
    handleSyncTableConfigChange: (tableName, field, value) => {
      runSyncTableConfigChange(
        input.dataSyncDraftActions,
        tableName,
        field,
        value,
      );
    },
    handlePreviewDataDiff: async () => {
      await runDataDiffPreview({
        isSyncSchemaLoading: input.isSyncSchemaLoading,
        syncSchemaIssueMessage: input.syncSchemaIssueMessage,
        syncSelectedTables: input.syncSelectedTables,
        selectedTableName: input.selectedTableName,
        syncTableConfigs: input.syncTableConfigs,
        sourceConnectionId: input.sourceConnectionId,
        targetConnectionId: input.targetConnectionId,
        includeUnchanged: input.includeUnchanged,
        previewDataDiff: input.previewDataDiff,
        loadDetail: handleLoadDataDiffDetail,
        setIssue: input.dataDiffActions.setIssue,
        beginPreview: input.dataDiffActions.beginPreview,
        applyPreview: input.dataDiffActions.applyPreview,
        finishPreview: input.dataDiffActions.finishPreview,
      });
    },
    handlePreviewDataApply: async () => {
      await runDataApplyPreview({
        diffPreview: input.diffPreview,
        currentTargetSnapshotHash: input.diffDetail?.currentTargetSnapshotHash,
        diffRows: input.diffRows,
        sourceConnectionId: input.sourceConnectionId,
        targetConnectionId: input.targetConnectionId,
        deleteWarningThreshold: input.deleteWarningThreshold,
        previewDataApply: input.previewDataApply,
        beginPreview: input.dataApplyActions.beginPreview,
        applyPreview: input.dataApplyActions.applyPreview,
        finishPreview: input.dataApplyActions.finishPreview,
        setIssue: input.setSyncIssue,
      });
    },
    handleLoadDataApplyJobDetail,
    refreshBackgroundJobs,
    handleLoadSelectedJobDetail: () =>
      runLoadSelectedJobDetail({
        selectedJobId: input.selectedJobId,
        currentDetailJobId: input.applyJobDetail?.jobId ?? null,
        loadJobDetail: handleLoadDataApplyJobDetail,
        setIssue: input.jobCenterActions.setIssue,
      }),
    handleOpenJobCenterForJob: (jobId) =>
      runOpenJobCenterForJob({
        jobId,
        loadJobDetail: handleLoadDataApplyJobDetail,
        setSelectedJobId: input.jobCenterActions.setSelectedJobId,
        setResultTab: input.jobCenterActions.setResultTab,
        clearIssue: input.jobCenterActions.clearIssue,
        setIssue: input.jobCenterActions.setIssue,
      }),
    handleReopenSyncContext: (jobId) =>
      runReopenSyncContext({
        jobId,
        currentDetail: input.applyJobDetail,
        loadJobDetail: handleLoadDataApplyJobDetail,
        setSyncSourceConnectionId:
          input.jobCenterActions.setSyncSourceConnectionId,
        setSyncTargetConnectionId:
          input.jobCenterActions.setSyncTargetConnectionId,
        setSelectedJobId: input.jobCenterActions.setSelectedJobId,
        setResultTab: input.jobCenterActions.setResultTab,
        setIssue: input.setSyncIssue,
      }),
    handleExecuteDataApply: async () => {
      await runDataApplyExecute({
        diffPreview: input.diffPreview,
        applyPreview: input.applyPreview,
        diffRows: input.diffRows,
        sourceConnectionId: input.sourceConnectionId,
        targetConnectionId: input.targetConnectionId,
        deleteWarningThreshold: input.deleteWarningThreshold,
        confirmUnsafeDelete: input.applyUnsafeDeleteConfirmed,
        targetDatabaseConfirmation: input.applyProdConfirmation,
        executeDataApply: input.executeDataApply,
        loadJobDetail: handleLoadDataApplyJobDetail,
        refreshBackgroundJobs,
        showNotification: input.showNotification,
        beginExecute: input.dataApplyActions.beginExecute,
        applyExecute: input.dataApplyActions.applyExecute,
        applyExecutionDetail: input.dataApplyActions.applyExecutionDetail,
        finishExecute: input.dataApplyActions.finishExecute,
        setIssue: input.setSyncIssue,
      });
    },
    startApplyJobPolling: () =>
      startDataApplyJobPolling({
        activeJobId: input.activeApplyJobId,
        activeJobStatus: input.activeApplyJobStatus,
        fetchDataApplyJobDetail: input.fetchDataApplyJobDetail,
        applyPolledDetail: ({ detail, jobSummary }) => {
          input.dataApplyActions.applyJobDetail({
            detail,
            jobSummary,
          });
        },
        refreshBackgroundJobs,
        showNotification: input.showNotification,
        setIssue: input.setSyncIssue,
        ...input.createPollingTimer(),
      }) ?? undefined,
    handleToggleSyncTable: (tableName) => {
      runToggleSyncTable(input.dataSyncDraftActions, tableName);
    },
    handleChangeSyncRowAction: (rowIndex, nextAction) => {
      runChangeSyncRowAction(
        input.dataSyncDraftActions,
        rowIndex,
        nextAction,
      );
    },
    handleToggleIncludeUnchangedRows: (nextIncludeUnchanged) => {
      runToggleIncludeUnchangedRows({
        actions: input.dataSyncDraftActions,
        nextIncludeUnchanged,
        currentDetailTableName: input.diffDetail?.tableName,
        loadDetail: handleLoadDataDiffDetail,
      });
    },
  };
}
