import type {
  DbBackgroundJobSummary,
  DbConnectionConfig,
  DbDataApplyJobDetailResponse,
  DbDataSyncBlockerCode,
} from "@shared/schema";

export type JobCenterConnectionsById = Map<string, DbConnectionConfig>;

export function formatDataSyncCounts(counts: {
  insert: number;
  update: number;
  delete: number;
  unchanged: number;
}): string {
  return `I:${counts.insert} U:${counts.update} D:${counts.delete} =:${counts.unchanged}`;
}

export function describeDataSyncBlocker(code: DbDataSyncBlockerCode): string {
  if (code === "target_snapshot_changed") {
    return "Target snapshot changed after compare. Re-run compare before execute.";
  }
  if (code === "artifact_expired") {
    return "Compare artifact expired. Re-run compare preview.";
  }
  if (code === "unsafe_delete_threshold") {
    return "Delete volume crossed unsafe_delete_threshold. Operator confirmation required.";
  }
  if (code === "unsafe_delete_confirmation_required") {
    return "Explicit unsafe delete confirmation is required before execute.";
  }
  if (code === "readonly_target") {
    return "Target connection is read-only and cannot apply changes.";
  }
  if (code === "target_database_confirmation_required") {
    return "Typed target database confirmation is required before execute.";
  }
  return "Missing stable key prevents deterministic row matching.";
}

export function buildJobCenterConnectionsById(
  connections: DbConnectionConfig[],
): JobCenterConnectionsById {
  return new Map(connections.map((connection) => [connection.id, connection]));
}

export function describeJobCenterConnection(
  connectionsById: JobCenterConnectionsById,
  connectionId: string | undefined,
): string {
  if (!connectionId) {
    return "n/a";
  }
  const connection = connectionsById.get(connectionId);
  if (!connection) {
    return connectionId;
  }
  return `${connection.name} (${connection.environment ?? "dev"}) / ${connection.database}`;
}

export function jobCenterStatusTone(
  status: DbBackgroundJobSummary["status"],
): string {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700";
  if (status === "running" || status === "pending") {
    return "bg-sky-500/10 text-sky-700";
  }
  if (status === "partial") return "bg-amber-500/10 text-amber-700";
  return "bg-destructive/10 text-destructive";
}

export function resolveJobCenterSelectedSummary(
  jobs: DbBackgroundJobSummary[],
  selectedJobId: string | null,
): DbBackgroundJobSummary | null {
  return jobs.find((job) => job.jobId === selectedJobId) ?? jobs[0] ?? null;
}

export function resolveJobCenterDetail(
  selectedJobDetail: DbDataApplyJobDetailResponse | null,
  selectedSummary: DbBackgroundJobSummary | null,
): DbDataApplyJobDetailResponse | null {
  return selectedJobDetail && selectedJobDetail.jobId === selectedSummary?.jobId
    ? selectedJobDetail
    : null;
}
