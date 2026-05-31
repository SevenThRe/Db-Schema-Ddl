import type {
  DbBackgroundJobSummary,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import {
  createDataApplyStateActions,
  type DataApplyStateActions,
} from "./data-apply-runner";
import {
  createDataDiffStateActions,
  type DataDiffStateActions,
} from "./data-sync-runner";
import {
  createDataSyncDraftActions,
  type DataSyncDraftActions,
} from "./data-sync-draft-runner";
import {
  createJobCenterStateActions,
  type JobCenterStateActions,
} from "./job-center-runner";
import {
  createSyncConnectionStateActions,
  type SyncConnectionStateActions,
} from "./workbench-sync-state-runner";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import type { WorkbenchResultTab } from "./workbench-session";

type Updater<T> = (updater: (current: T) => T) => void;

export interface WorkbenchSyncStateActions {
  dataApply: DataApplyStateActions;
  dataDiff: DataDiffStateActions;
  dataSyncDraft: DataSyncDraftActions;
  syncConnection: SyncConnectionStateActions;
  jobCenter: JobCenterStateActions;
}

export function createWorkbenchSyncStateActions(input: {
  selectResultTab: (tab: WorkbenchResultTab) => void;
  setSyncIssue: (message: string | null) => void;
  setIsApplyPreviewing: (isPreviewing: boolean) => void;
  setApplyPreview: (preview: DbDataApplyPreviewResponse | null) => void;
  setApplyUnsafeDeleteConfirmed: (confirmed: boolean) => void;
  setApplyProdConfirmation: (confirmation: string) => void;
  setIsExecutingApply: (isExecuting: boolean) => void;
  setApplyExecute: (result: DbDataApplyExecuteResponse | null) => void;
  updateApplyExecute: Updater<DbDataApplyExecuteResponse | null>;
  setSelectedJobId: (jobId: string) => void;
  setApplyJobDetail: (detail: DbDataApplyJobDetailResponse) => void;
  updateBackgroundJobs: Updater<DbBackgroundJobSummary[]>;
  setIsDiffPreviewing: (isPreviewing: boolean) => void;
  setDiffPreview: (preview: DbDataDiffPreviewResponse | null) => void;
  setDiffDetail: (detail: DbDataDiffDetailResponse | null) => void;
  setDiffRows: (rows: DataSyncRowDiffEntry[]) => void;
  setSelectedDiffRowIndex: (index: number) => void;
  updateSelectedTables: Updater<string[]>;
  updateTableConfigs: Updater<Record<string, SyncTableConfigDraft>>;
  updateRows: Updater<DataSyncRowDiffEntry[]>;
  setIncludeUnchanged: (includeUnchanged: boolean) => void;
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
  setIsRefreshingJobs: (isRefreshing: boolean) => void;
  setJobCenterIssue: (message: string | null) => void;
  updateSelectedJobId: Updater<string | null>;
}): WorkbenchSyncStateActions {
  return {
    dataApply: createDataApplyStateActions({
      setIsPreviewing: input.setIsApplyPreviewing,
      setApplyPreview: input.setApplyPreview,
      setApplyUnsafeDeleteConfirmed: input.setApplyUnsafeDeleteConfirmed,
      setApplyProdConfirmation: input.setApplyProdConfirmation,
      setResultTab: () => input.selectResultTab("sync"),
      setIsExecuting: input.setIsExecutingApply,
      setIssue: input.setSyncIssue,
      setApplyExecute: input.setApplyExecute,
      updateApplyExecute: input.updateApplyExecute,
      setSelectedJobId: input.setSelectedJobId,
      setApplyJobDetail: input.setApplyJobDetail,
      updateBackgroundJobs: input.updateBackgroundJobs,
    }),
    dataDiff: createDataDiffStateActions({
      setIssue: input.setSyncIssue,
      setResultTab: () => input.selectResultTab("sync"),
      setIsDiffPreviewing: input.setIsDiffPreviewing,
      setDiffPreview: input.setDiffPreview,
      setDiffDetail: input.setDiffDetail,
      setDiffRows: input.setDiffRows,
      setSelectedDiffRowIndex: input.setSelectedDiffRowIndex,
      setApplyPreview: input.setApplyPreview,
      setApplyExecute: input.setApplyExecute,
    }),
    dataSyncDraft: createDataSyncDraftActions({
      updateSelectedTables: input.updateSelectedTables,
      updateTableConfigs: input.updateTableConfigs,
      updateRows: input.updateRows,
      setIncludeUnchanged: input.setIncludeUnchanged,
      setApplyPreview: input.setApplyPreview,
      setApplyExecute: input.setApplyExecute,
    }),
    syncConnection: createSyncConnectionStateActions({
      setSyncSourceConnectionId: input.setSyncSourceConnectionId,
      setSyncTargetConnectionId: input.setSyncTargetConnectionId,
    }),
    jobCenter: createJobCenterStateActions({
      setIsRefreshing: input.setIsRefreshingJobs,
      setIssue: input.setJobCenterIssue,
      updateJobs: input.updateBackgroundJobs,
      updateSelectedJobId: input.updateSelectedJobId,
      setSelectedJobId: input.setSelectedJobId,
      setResultTab: input.selectResultTab,
      setSyncSourceConnectionId: input.setSyncSourceConnectionId,
      setSyncTargetConnectionId: input.setSyncTargetConnectionId,
    }),
  };
}
