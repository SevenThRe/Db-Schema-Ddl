import type {
  DbBackgroundJobSummary,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyJobStatus,
} from "@shared/schema";

import { isDataApplyJobActive } from "./data-apply-runtime";

export interface BuildWorkbenchSyncJobContextInput {
  backgroundJobs: DbBackgroundJobSummary[];
  selectedJobId: string | null | undefined;
  applyExecute: DbDataApplyExecuteResponse | null | undefined;
  applyJobDetail: DbDataApplyJobDetailResponse | null | undefined;
}

export interface WorkbenchSyncJobContext {
  selectedBackgroundJob: DbBackgroundJobSummary | null;
  activeBackgroundJob: DbBackgroundJobSummary | null;
  activeApplyJobId: string | null;
  activeApplyJobStatus: DbDataApplyJobStatus | null;
}

export function buildWorkbenchSyncJobContext(
  input: BuildWorkbenchSyncJobContextInput,
): WorkbenchSyncJobContext {
  const selectedBackgroundJob =
    input.backgroundJobs.find((job) => job.jobId === input.selectedJobId) ?? null;
  const activeBackgroundJob =
    input.backgroundJobs.find((job) => isDataApplyJobActive(job.status)) ?? null;
  const activeApplyJobId =
    input.applyExecute?.jobId ??
    activeBackgroundJob?.jobId ??
    input.applyJobDetail?.jobId ??
    null;
  const activeApplyJobStatus =
    (input.applyJobDetail && input.applyJobDetail.jobId === activeApplyJobId
      ? input.applyJobDetail.status
      : null) ??
    (input.applyExecute && input.applyExecute.jobId === activeApplyJobId
      ? input.applyExecute.status
      : null) ??
    activeBackgroundJob?.status ??
    null;

  return {
    selectedBackgroundJob,
    activeBackgroundJob,
    activeApplyJobId,
    activeApplyJobStatus,
  };
}
