import { useState } from "react";
import type { DbBackgroundJobSummary } from "@shared/schema";

export function useWorkbenchResultWorkspaceState(initialSelectedJobId: string | null) {
  const [backgroundJobs, setBackgroundJobs] =
    useState<DbBackgroundJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] =
    useState<string | null>(initialSelectedJobId);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [jobCenterIssue, setJobCenterIssue] = useState<string | null>(null);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [currentExportRequestId, setCurrentExportRequestId] =
    useState<string | null>(null);

  return {
    activeBatchIndex,
    backgroundJobs,
    currentExportRequestId,
    isExporting,
    isRefreshingJobs,
    jobCenterIssue,
    selectedJobId,
    setActiveBatchIndex,
    setBackgroundJobs,
    setCurrentExportRequestId,
    setIsExporting,
    setIsRefreshingJobs,
    setJobCenterIssue,
    setSelectedJobId,
  };
}
