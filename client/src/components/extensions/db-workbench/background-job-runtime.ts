import type {
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "@shared/schema";

function backgroundJobSortValue(job: { startedAt?: string; createdAt: string }): number {
  return Date.parse(job.startedAt ?? job.createdAt) || 0;
}

export function mergeBackgroundJobs(
  current: DbBackgroundJobSummary[],
  incoming: DbBackgroundJobSummary[],
): DbBackgroundJobSummary[] {
  const map = new Map(current.map((job) => [job.jobId, job]));
  for (const job of incoming) {
    map.set(job.jobId, {
      ...(map.get(job.jobId) ?? {}),
      ...job,
    });
  }
  return Array.from(map.values()).sort(
    (left, right) => backgroundJobSortValue(right) - backgroundJobSortValue(left),
  );
}

export function toBackgroundJobSummary(
  detail: DbDataApplyJobDetailResponse,
): DbBackgroundJobSummary {
  const uniqueTableNames = new Set(detail.tableResults.map((result) => result.tableName));

  return {
    jobId: detail.jobId,
    jobKind: "data-apply",
    title: "Data Sync Apply",
    sourceConnectionId: detail.sourceConnectionId,
    targetConnectionId: detail.targetConnectionId,
    status: detail.status,
    statusCounts: detail.statusCounts,
    blockers: detail.blockers,
    tableCount: uniqueTableNames.size,
    primaryTableName: detail.tableResults[0]?.tableName,
    statementCount: detail.statementCount,
    sqlPreviewLines: detail.sqlPreviewLines,
    previewTruncated: detail.previewTruncated,
    failureSummary: detail.tableResults.find((result) => result.error)?.error,
    createdAt: detail.createdAt,
    startedAt: detail.startedAt,
    finishedAt: detail.finishedAt,
  };
}
