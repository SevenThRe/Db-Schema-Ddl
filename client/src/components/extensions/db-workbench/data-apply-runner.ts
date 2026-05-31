import type {
  DbBackgroundJobSummary,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailRequest,
  DbDataApplyJobDetailResponse,
  DbDataApplyJobStatus,
  DbDataApplyPreviewRequest,
  DbDataApplyPreviewResponse,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import { toBackgroundJobSummary } from "./background-job-runtime";
import { mergeBackgroundJobs } from "./background-job-runtime";
import {
  buildDataApplyExecuteRequest,
  buildDataApplyNotification,
  formatDataApplyExecuteError,
  getDataApplyJobPollDelayMs,
  getDataApplyJobRetryDelayMs,
  isDataApplyJobActive,
  mergeDataApplyExecutionDetail,
  validateDataApplyExecutionReadiness,
} from "./data-apply-runtime";
import { buildDataApplySelections } from "./data-sync-utils";
import { formatWorkbenchError } from "./workbench-errors";

export function formatDataApplyPreviewError(error: unknown): string {
  return formatWorkbenchError(error, "Failed to preview apply operation.");
}

export interface RunDataApplyPreviewInput {
  diffPreview: DbDataDiffPreviewResponse | null;
  currentTargetSnapshotHash: string | undefined;
  diffRows: DataSyncRowDiffEntry[];
  sourceConnectionId: string;
  targetConnectionId: string;
  deleteWarningThreshold: number;
  previewDataApply: (
    request: DbDataApplyPreviewRequest,
  ) => Promise<DbDataApplyPreviewResponse>;
  beginPreview: () => void;
  applyPreview: (preview: DbDataApplyPreviewResponse) => void;
  finishPreview: () => void;
  setIssue: (message: string | null) => void;
}

export async function runDataApplyPreview(
  input: RunDataApplyPreviewInput,
): Promise<DbDataApplyPreviewResponse | null> {
  if (!input.diffPreview) {
    input.setIssue("Run compare preview first.");
    return null;
  }

  const selections = buildDataApplySelections(input.diffRows);
  if (selections.length === 0) {
    input.setIssue("No row actions are selected for apply preview.");
    return null;
  }

  input.beginPreview();
  try {
    const preview = await input.previewDataApply({
      compareId: input.diffPreview.compareId,
      sourceConnectionId: input.sourceConnectionId,
      targetConnectionId: input.targetConnectionId,
      targetSnapshotHash: input.diffPreview.targetSnapshotHash,
      currentTargetSnapshotHash: input.currentTargetSnapshotHash,
      selections,
      deleteWarningThreshold: input.deleteWarningThreshold,
    });
    input.applyPreview(preview);
    return preview;
  } catch (error) {
    input.setIssue(formatDataApplyPreviewError(error));
    return null;
  } finally {
    input.finishPreview();
  }
}

export interface RunDataApplyJobDetailInput {
  jobId: string;
  fetchDataApplyJobDetail: (
    request: DbDataApplyJobDetailRequest,
  ) => Promise<DbDataApplyJobDetailResponse>;
  applyDetail: (input: {
    detail: DbDataApplyJobDetailResponse;
    jobSummary: DbBackgroundJobSummary;
  }) => void;
}

export async function runDataApplyJobDetail(
  input: RunDataApplyJobDetailInput,
): Promise<DbDataApplyJobDetailResponse> {
  const detail = await input.fetchDataApplyJobDetail({ jobId: input.jobId });
  input.applyDetail({
    detail,
    jobSummary: toBackgroundJobSummary(detail),
  });
  return detail;
}

export interface RunDataApplyExecuteInput {
  diffPreview: DbDataDiffPreviewResponse | null;
  applyPreview: DbDataApplyPreviewResponse | null;
  diffRows: DataSyncRowDiffEntry[];
  sourceConnectionId: string;
  targetConnectionId: string;
  deleteWarningThreshold: number;
  confirmUnsafeDelete: boolean;
  targetDatabaseConfirmation: string;
  executeDataApply: (
    request: ReturnType<typeof buildDataApplyExecuteRequest>,
  ) => Promise<DbDataApplyExecuteResponse>;
  loadJobDetail: (jobId: string) => Promise<DbDataApplyJobDetailResponse>;
  refreshBackgroundJobs: (preserveIssue: boolean) => Promise<void>;
  showNotification: (notification: ReturnType<typeof buildDataApplyNotification>) => void;
  beginExecute: () => void;
  applyExecute: (result: DbDataApplyExecuteResponse) => void;
  applyExecutionDetail: (
    detail: DbDataApplyJobDetailResponse,
    options?: { refreshCurrentTargetSnapshotHash?: boolean },
  ) => void;
  finishExecute: () => void;
  setIssue: (message: string | null) => void;
}

export function runBeginDataApplyExecuteState(input: {
  setIsExecuting: (isExecuting: boolean) => void;
  setIssue: (message: string | null) => void;
}): void {
  input.setIsExecuting(true);
  input.setIssue(null);
}

export function runApplyDataApplyExecuteState(input: {
  result: DbDataApplyExecuteResponse;
  setApplyExecute: (result: DbDataApplyExecuteResponse) => void;
  setSelectedJobId: (jobId: string) => void;
}): void {
  input.setApplyExecute(input.result);
  input.setSelectedJobId(input.result.jobId);
}

export function runMergeDataApplyExecutionDetailState(input: {
  detail: DbDataApplyJobDetailResponse;
  options?: { refreshCurrentTargetSnapshotHash?: boolean };
  updateApplyExecute: (
    updater: (
      current: DbDataApplyExecuteResponse | null,
    ) => DbDataApplyExecuteResponse | null,
  ) => void;
}): void {
  input.updateApplyExecute((current) =>
    mergeDataApplyExecutionDetail(current, input.detail, input.options),
  );
}

export function runFinishDataApplyExecuteState(input: {
  setIsExecuting: (isExecuting: boolean) => void;
}): void {
  input.setIsExecuting(false);
}

export interface DataApplyStateActions {
  beginPreview: () => void;
  applyPreview: (preview: DbDataApplyPreviewResponse) => void;
  finishPreview: () => void;
  beginExecute: () => void;
  applyExecute: (result: DbDataApplyExecuteResponse) => void;
  applyExecutionDetail: (
    detail: DbDataApplyJobDetailResponse,
    options?: { refreshCurrentTargetSnapshotHash?: boolean },
  ) => void;
  finishExecute: () => void;
  applyJobDetail: (input: {
    detail: DbDataApplyJobDetailResponse;
    jobSummary: DbBackgroundJobSummary;
  }) => void;
  applySelectedJobDetail: (input: {
    detail: DbDataApplyJobDetailResponse;
    jobSummary: DbBackgroundJobSummary;
  }) => void;
  setUnsafeDeleteConfirmed: (confirmed: boolean) => void;
  setProdConfirmation: (confirmation: string) => void;
}

export function createDataApplyStateActions(input: {
  setIsPreviewing: (isPreviewing: boolean) => void;
  setApplyPreview: (preview: DbDataApplyPreviewResponse) => void;
  setApplyUnsafeDeleteConfirmed: (confirmed: boolean) => void;
  setApplyProdConfirmation: (confirmation: string) => void;
  setResultTab: () => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setIssue: (message: string | null) => void;
  setApplyExecute: (result: DbDataApplyExecuteResponse) => void;
  updateApplyExecute: (
    updater: (
      current: DbDataApplyExecuteResponse | null,
    ) => DbDataApplyExecuteResponse | null,
  ) => void;
  setSelectedJobId: (jobId: string) => void;
  setApplyJobDetail: (detail: DbDataApplyJobDetailResponse) => void;
  updateBackgroundJobs: (
    updater: (current: DbBackgroundJobSummary[]) => DbBackgroundJobSummary[],
  ) => void;
}): DataApplyStateActions {
  const applyJobDetail = ({
    detail,
    jobSummary,
  }: {
    detail: DbDataApplyJobDetailResponse;
    jobSummary: DbBackgroundJobSummary;
  }) => {
    runApplyDataApplyJobDetailState({
      detail,
      jobSummary,
      setApplyJobDetail: input.setApplyJobDetail,
      updateBackgroundJobs: input.updateBackgroundJobs,
      updateApplyExecute: input.updateApplyExecute,
    });
  };

  return {
    beginPreview: () => {
      input.setIsPreviewing(true);
      input.setIssue(null);
      input.setApplyUnsafeDeleteConfirmed(false);
      input.setResultTab();
    },
    applyPreview: input.setApplyPreview,
    finishPreview: () => input.setIsPreviewing(false),
    beginExecute: () =>
      runBeginDataApplyExecuteState({
        setIsExecuting: input.setIsExecuting,
        setIssue: input.setIssue,
      }),
    applyExecute: (result) =>
      runApplyDataApplyExecuteState({
        result,
        setApplyExecute: input.setApplyExecute,
        setSelectedJobId: input.setSelectedJobId,
      }),
    applyExecutionDetail: (detail, options) =>
      runMergeDataApplyExecutionDetailState({
        detail,
        options,
        updateApplyExecute: input.updateApplyExecute,
      }),
    finishExecute: () =>
      runFinishDataApplyExecuteState({
        setIsExecuting: input.setIsExecuting,
      }),
    applyJobDetail,
    applySelectedJobDetail: ({ detail, jobSummary }) => {
      applyJobDetail({ detail, jobSummary });
      input.setSelectedJobId(detail.jobId);
    },
    setUnsafeDeleteConfirmed: input.setApplyUnsafeDeleteConfirmed,
    setProdConfirmation: input.setApplyProdConfirmation,
  };
}

export async function runDataApplyExecute(
  input: RunDataApplyExecuteInput,
): Promise<DbDataApplyExecuteResponse | null> {
  const selections = buildDataApplySelections(input.diffRows);
  const readinessIssue = validateDataApplyExecutionReadiness({
    diffPreview: input.diffPreview,
    applyPreview: input.applyPreview,
    selections,
  });
  if (readinessIssue) {
    input.setIssue(readinessIssue);
    return null;
  }
  if (!input.diffPreview || !input.applyPreview) {
    return null;
  }

  input.beginExecute();
  try {
    const result = await input.executeDataApply(
      buildDataApplyExecuteRequest({
        diffPreview: input.diffPreview,
        applyPreview: input.applyPreview,
        sourceConnectionId: input.sourceConnectionId,
        targetConnectionId: input.targetConnectionId,
        selections,
        deleteWarningThreshold: input.deleteWarningThreshold,
        confirmUnsafeDelete: input.confirmUnsafeDelete,
        targetDatabaseConfirmation: input.targetDatabaseConfirmation,
      }),
    );
    input.applyExecute(result);
    const detail = await input.loadJobDetail(result.jobId);
    await input.refreshBackgroundJobs(true);
    input.showNotification(
      buildDataApplyNotification(result.status, result.statusCounts, "execute"),
    );
    if (detail.status !== result.status) {
      input.applyExecutionDetail(detail, {
        refreshCurrentTargetSnapshotHash: false,
      });
    }
    return result;
  } catch (error) {
    input.setIssue(formatDataApplyExecuteError(error));
    return null;
  } finally {
    input.finishExecute();
  }
}

export function mergeDataApplyExecuteWithDetail(
  current: DbDataApplyExecuteResponse | null,
  detail: DbDataApplyJobDetailResponse,
  options?: { refreshCurrentTargetSnapshotHash?: boolean },
): DbDataApplyExecuteResponse | null {
  return mergeDataApplyExecutionDetail(current, detail, options);
}

export function runApplyDataApplyJobDetailState(input: {
  detail: DbDataApplyJobDetailResponse;
  jobSummary: DbBackgroundJobSummary;
  setApplyJobDetail: (detail: DbDataApplyJobDetailResponse) => void;
  updateBackgroundJobs: (
    updater: (current: DbBackgroundJobSummary[]) => DbBackgroundJobSummary[],
  ) => void;
  updateApplyExecute: (
    updater: (
      current: DbDataApplyExecuteResponse | null,
    ) => DbDataApplyExecuteResponse | null,
  ) => void;
}): void {
  input.setApplyJobDetail(input.detail);
  input.updateBackgroundJobs((current) =>
    mergeBackgroundJobs(current, [input.jobSummary]),
  );
  runMergeDataApplyExecutionDetailState({
    detail: input.detail,
    updateApplyExecute: input.updateApplyExecute,
  });
}

export interface StartDataApplyJobPollingInput {
  activeJobId: string | null;
  activeJobStatus: DbDataApplyJobStatus | null;
  fetchDataApplyJobDetail: (
    request: DbDataApplyJobDetailRequest,
  ) => Promise<DbDataApplyJobDetailResponse>;
  applyPolledDetail: (input: {
    detail: DbDataApplyJobDetailResponse;
    jobSummary: DbBackgroundJobSummary;
  }) => void;
  refreshBackgroundJobs: (preserveIssue: boolean) => Promise<void>;
  showNotification: (notification: ReturnType<typeof buildDataApplyNotification>) => void;
  setIssue: (message: string) => void;
  setTimer: (callback: () => void | Promise<void>, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
}

export function createBrowserDataApplyPollingTimer(): Pick<
  StartDataApplyJobPollingInput,
  "setTimer" | "clearTimer"
> {
  return {
    setTimer: (callback, delayMs) =>
      window.setTimeout(() => {
        void callback();
      }, delayMs),
    clearTimer: (timerId) => window.clearTimeout(timerId),
  };
}

export function startDataApplyJobPolling(
  input: StartDataApplyJobPollingInput,
): (() => void) | null {
  if (!input.activeJobId || !isDataApplyJobActive(input.activeJobStatus)) {
    return null;
  }
  const activeJobId = input.activeJobId;

  let cancelled = false;
  let timerId: number | null = null;

  const schedule = (delayMs: number) => {
    timerId = input.setTimer(poll, delayMs);
  };

  const poll = async () => {
    try {
      const detail = await input.fetchDataApplyJobDetail({
        jobId: activeJobId,
      });
      if (cancelled) return;

      input.applyPolledDetail({
        detail,
        jobSummary: toBackgroundJobSummary(detail),
      });
      await input.refreshBackgroundJobs(true);
      if (cancelled) return;

      const nextPollDelay = getDataApplyJobPollDelayMs(detail.status);
      if (nextPollDelay !== null) {
        schedule(nextPollDelay);
        return;
      }

      input.showNotification(
        buildDataApplyNotification(detail.status, detail.statusCounts, "detail"),
      );
    } catch (error) {
      if (cancelled) return;
      input.setIssue(
        formatWorkbenchError(error, "Failed to refresh apply job detail."),
      );
      schedule(getDataApplyJobRetryDelayMs());
    }
  };

  schedule(getDataApplyJobPollDelayMs(input.activeJobStatus) ?? 1500);

  return () => {
    cancelled = true;
    if (timerId !== null) {
      input.clearTimer(timerId);
    }
  };
}
