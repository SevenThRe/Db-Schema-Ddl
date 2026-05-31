import type {
  DbBackgroundJobSummary,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
} from "@shared/schema";
import { mergeBackgroundJobs } from "./background-job-runtime";
import { mergeDataApplyExecutionDetail } from "./data-apply-runtime";

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
