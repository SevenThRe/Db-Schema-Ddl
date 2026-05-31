import type {
  DbBackgroundJobListResponse,
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "@shared/schema";
import { mergeBackgroundJobs } from "./background-job-runtime";
import type { WorkbenchResultTab } from "./workbench-session";
import { formatWorkbenchError } from "./workbench-errors";

export interface RunRefreshBackgroundJobsInput {
  preserveIssue: boolean;
  listBackgroundJobs: () => Promise<DbBackgroundJobListResponse>;
  beginRefresh: () => void;
  clearIssue: () => void;
  applyJobs: (
    updater: (current: DbBackgroundJobSummary[]) => DbBackgroundJobSummary[],
  ) => void;
  applySelectedJobId: (updater: (current: string | null) => string | null) => void;
  setIssue: (message: string) => void;
  finishRefresh: () => void;
}

export interface JobCenterStateActions {
  beginRefresh: () => void;
  clearIssue: () => void;
  applyJobs: (
    updater: (current: DbBackgroundJobSummary[]) => DbBackgroundJobSummary[],
  ) => void;
  applySelectedJobId: (updater: (current: string | null) => string | null) => void;
  setSelectedJobId: (jobId: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
  setIssue: (message: string) => void;
  finishRefresh: () => void;
}

export function createJobCenterStateActions(input: {
  setIsRefreshing: (isRefreshing: boolean) => void;
  setIssue: (message: string | null) => void;
  updateJobs: (
    updater: (current: DbBackgroundJobSummary[]) => DbBackgroundJobSummary[],
  ) => void;
  updateSelectedJobId: (updater: (current: string | null) => string | null) => void;
  setSelectedJobId: (jobId: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
}): JobCenterStateActions {
  return {
    beginRefresh: () => input.setIsRefreshing(true),
    clearIssue: () => input.setIssue(null),
    applyJobs: input.updateJobs,
    applySelectedJobId: input.updateSelectedJobId,
    setSelectedJobId: input.setSelectedJobId,
    setResultTab: input.setResultTab,
    setSyncSourceConnectionId: input.setSyncSourceConnectionId,
    setSyncTargetConnectionId: input.setSyncTargetConnectionId,
    setIssue: input.setIssue,
    finishRefresh: () => input.setIsRefreshing(false),
  };
}

export async function runRefreshBackgroundJobs(
  input: RunRefreshBackgroundJobsInput,
): Promise<DbBackgroundJobSummary[] | null> {
  input.beginRefresh();
  if (!input.preserveIssue) {
    input.clearIssue();
  }

  try {
    const response = await input.listBackgroundJobs();
    let mergedJobs: DbBackgroundJobSummary[] = [];
    input.applyJobs((current) => {
      mergedJobs = mergeBackgroundJobs(current, response.jobs);
      return mergedJobs;
    });
    input.applySelectedJobId((current) =>
      current && mergedJobs.some((job) => job.jobId === current)
        ? current
        : mergedJobs[0]?.jobId ?? null,
    );
    return mergedJobs;
  } catch (error) {
    input.setIssue(
      formatWorkbenchError(error, "Failed to refresh recent background jobs."),
    );
    return null;
  } finally {
    input.finishRefresh();
  }
}

export interface RunOpenJobCenterForJobInput {
  jobId: string;
  loadJobDetail: (jobId: string) => Promise<DbDataApplyJobDetailResponse | null>;
  setSelectedJobId: (jobId: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  clearIssue: () => void;
  setIssue: (message: string) => void;
}

export async function runOpenJobCenterForJob(
  input: RunOpenJobCenterForJobInput,
): Promise<DbDataApplyJobDetailResponse | null> {
  input.setSelectedJobId(input.jobId);
  input.setResultTab("jobs");
  input.clearIssue();
  try {
    return await input.loadJobDetail(input.jobId);
  } catch (error) {
    input.setIssue(
      formatWorkbenchError(error, "Failed to open background job detail."),
    );
    return null;
  }
}

export interface RunLoadSelectedJobDetailInput {
  selectedJobId: string | null;
  currentDetailJobId: string | null;
  loadJobDetail: (jobId: string) => Promise<DbDataApplyJobDetailResponse | null>;
  setIssue: (message: string) => void;
}

export async function runLoadSelectedJobDetail(
  input: RunLoadSelectedJobDetailInput,
): Promise<DbDataApplyJobDetailResponse | null> {
  if (!input.selectedJobId) {
    return null;
  }
  if (input.currentDetailJobId === input.selectedJobId) {
    return null;
  }

  try {
    return await input.loadJobDetail(input.selectedJobId);
  } catch (error) {
    input.setIssue(
      formatWorkbenchError(error, "Failed to load selected background job detail."),
    );
    return null;
  }
}

export interface RunReopenSyncContextInput {
  jobId: string;
  currentDetail: DbDataApplyJobDetailResponse | null;
  loadJobDetail: (jobId: string) => Promise<DbDataApplyJobDetailResponse | null>;
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
  setSelectedJobId: (jobId: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setIssue: (message: string) => void;
}

export async function runReopenSyncContext(
  input: RunReopenSyncContextInput,
): Promise<DbDataApplyJobDetailResponse | null> {
  try {
    const detail =
      input.currentDetail?.jobId === input.jobId
        ? input.currentDetail
        : await input.loadJobDetail(input.jobId);
    if (!detail) {
      return null;
    }

    input.setSyncSourceConnectionId(detail.sourceConnectionId);
    input.setSyncTargetConnectionId(detail.targetConnectionId);
    input.setSelectedJobId(input.jobId);
    input.setResultTab("sync");
    return detail;
  } catch (error) {
    input.setIssue(
      formatWorkbenchError(error, "Failed to restore sync context from job history."),
    );
    return null;
  }
}
