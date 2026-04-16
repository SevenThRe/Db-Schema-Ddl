import type {
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyJobStatus,
  DbDataDiffActionCounts,
} from "@shared/schema";

export type DataApplyNotification = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

type DataApplyNotificationSource = "execute" | "detail";

type MergeDataApplyExecutionDetailOptions = {
  refreshCurrentTargetSnapshotHash?: boolean;
};

function countAppliedRowActions(counts: DbDataDiffActionCounts): number {
  return counts.insert + counts.update + counts.delete;
}

export function isDataApplyJobActive(status: DbDataApplyJobStatus | null | undefined): boolean {
  return status === "running" || status === "pending";
}

export function buildDataApplyNotification(
  status: DbDataApplyJobStatus,
  counts: DbDataDiffActionCounts,
  source: DataApplyNotificationSource = "detail",
): DataApplyNotification {
  if (status === "running" || status === "pending") {
    return {
      title: "Data Sync apply started",
      description: "The apply job is running in the background. Job detail will refresh automatically.",
      variant: "default",
    };
  }

  if (status === "completed") {
    return {
      title: "Data Sync apply completed",
      description: `${countAppliedRowActions(counts)} row actions executed. Re-run compare to refresh deltas.`,
      variant: "success",
    };
  }

  if (status === "partial") {
    return {
      title: "Data Sync apply finished with partial failures",
      description:
        source === "execute"
          ? "The apply job completed with some failed row actions. Open Job Center for the persisted audit trail."
          : "The apply job completed with partial failures. Open Job Center for the persisted audit trail.",
      variant: "destructive",
    };
  }

  return {
    title: "Data Sync apply finished with failure",
    description: "The apply transaction did not fully commit. Review job detail for failure context.",
    variant: "destructive",
  };
}

export function mergeDataApplyExecutionDetail(
  current: DbDataApplyExecuteResponse | null,
  detail: DbDataApplyJobDetailResponse,
  options: MergeDataApplyExecutionDetailOptions = {},
): DbDataApplyExecuteResponse | null {
  if (!current || current.jobId !== detail.jobId) {
    return current;
  }

  const refreshCurrentTargetSnapshotHash = options.refreshCurrentTargetSnapshotHash ?? true;

  return {
    ...current,
    currentTargetSnapshotHash: refreshCurrentTargetSnapshotHash
      ? detail.currentTargetSnapshotHash ?? current.currentTargetSnapshotHash
      : current.currentTargetSnapshotHash,
    status: detail.status,
    statusCounts: detail.statusCounts,
    tableResults: detail.tableResults,
    blockers: detail.blockers,
  };
}
