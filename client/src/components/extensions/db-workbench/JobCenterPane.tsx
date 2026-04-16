import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DbBackgroundJobSummary,
  DbConnectionConfig,
  DbDataApplyJobDetailResponse,
  DbDataSyncBlockerCode,
} from "@shared/schema";

function formatDataSyncCounts(counts: {
  insert: number;
  update: number;
  delete: number;
  unchanged: number;
}): string {
  return `I:${counts.insert} U:${counts.update} D:${counts.delete} =:${counts.unchanged}`;
}

function describeDataSyncBlocker(code: DbDataSyncBlockerCode): string {
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

function describeConnection(
  connectionsById: Map<string, DbConnectionConfig>,
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

function statusTone(status: DbBackgroundJobSummary["status"]): string {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700";
  if (status === "running" || status === "pending") return "bg-sky-500/10 text-sky-700";
  if (status === "partial") return "bg-amber-500/10 text-amber-700";
  return "bg-destructive/10 text-destructive";
}

export interface JobCenterPaneProps {
  jobs: DbBackgroundJobSummary[];
  selectedJobId: string | null;
  selectedJobDetail: DbDataApplyJobDetailResponse | null;
  connections: DbConnectionConfig[];
  activeConnectionId: string;
  isRefreshing: boolean;
  issue: string | null;
  onRefresh: () => void;
  onSelectJob: (jobId: string) => void;
  onReopenSyncContext: (jobId: string) => void;
}

export function JobCenterPane({
  jobs,
  selectedJobId,
  selectedJobDetail,
  connections,
  activeConnectionId,
  isRefreshing,
  issue,
  onRefresh,
  onSelectJob,
  onReopenSyncContext,
}: JobCenterPaneProps) {
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));
  const selectedSummary =
    jobs.find((job) => job.jobId === selectedJobId) ??
    jobs[0] ??
    null;
  const detail =
    selectedJobDetail && selectedJobDetail.jobId === selectedSummary?.jobId
      ? selectedJobDetail
      : null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border bg-panel-muted/40 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Job Center
            </p>
            <p className="text-[11px] text-muted-foreground">
              Recent background DB work
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={onRefresh}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {issue ? (
            <div className="mb-2 rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
              {issue}
            </div>
          ) : null}

          {jobs.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
              No persisted background jobs yet. Data Sync apply history will appear here once jobs are executed.
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const active = job.jobId === selectedSummary?.jobId;
                const relatedToCurrentConnection =
                  job.sourceConnectionId === activeConnectionId ||
                  job.targetConnectionId === activeConnectionId;

                return (
                  <button
                    key={job.jobId}
                    type="button"
                    onClick={() => onSelectJob(job.jobId)}
                    className={cn(
                      "w-full rounded-sm border p-2 text-left text-xs",
                      active
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border bg-background hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] font-semibold">
                          {job.title}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {job.jobId}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("rounded-sm border-0 text-[10px]", statusTone(job.status))}>
                        {job.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDataSyncCounts(job.statusCounts)}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {describeConnection(connectionsById, job.sourceConnectionId)} -&gt;{" "}
                      {describeConnection(connectionsById, job.targetConnectionId)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      created {job.createdAt}
                      {job.finishedAt ? ` / finished ${job.finishedAt}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {job.primaryTableName ? (
                        <Badge variant="secondary" className="rounded-sm text-[10px]">
                          {job.primaryTableName}
                        </Badge>
                      ) : null}
                      {job.tableCount > 1 ? (
                        <Badge variant="secondary" className="rounded-sm text-[10px]">
                          {job.tableCount} tables
                        </Badge>
                      ) : null}
                      {relatedToCurrentConnection ? (
                        <Badge variant="secondary" className="rounded-sm text-[10px]">
                          current connection
                        </Badge>
                      ) : null}
                    </div>
                    {job.failureSummary ? (
                      <p className="mt-2 line-clamp-2 text-[11px] text-destructive">
                        {job.failureSummary}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-auto bg-background p-3">
        {!selectedSummary ? (
          <div className="rounded-sm border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
            Select a recent job to review its audit trail and reopen related sync context.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">{selectedSummary.jobId}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedSummary.title} / {selectedSummary.jobKind}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("rounded-sm border-0 text-[10px]", statusTone(selectedSummary.status))}>
                  {selectedSummary.status}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => onReopenSyncContext(selectedSummary.jobId)}
                >
                  Reopen sync context
                </Button>
              </div>
            </div>

            <div className="grid gap-2 text-[11px] text-muted-foreground md:grid-cols-2">
              <div className="rounded-sm border border-border bg-muted/20 p-2">
                <p className="font-medium text-foreground">Source</p>
                <p>{describeConnection(connectionsById, selectedSummary.sourceConnectionId)}</p>
              </div>
              <div className="rounded-sm border border-border bg-muted/20 p-2">
                <p className="font-medium text-foreground">Target</p>
                <p>{describeConnection(connectionsById, selectedSummary.targetConnectionId)}</p>
              </div>
              <div className="rounded-sm border border-border bg-muted/20 p-2">
                <p className="font-medium text-foreground">Counts</p>
                <p>{formatDataSyncCounts(selectedSummary.statusCounts)}</p>
              </div>
              <div className="rounded-sm border border-border bg-muted/20 p-2">
                <p className="font-medium text-foreground">Statements</p>
                <p>
                  {selectedSummary.statementCount}
                  {selectedSummary.previewTruncated ? " / preview truncated" : ""}
                </p>
              </div>
            </div>

            <div className="rounded-sm border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
              <p>created: {selectedSummary.createdAt}</p>
              {selectedSummary.startedAt ? <p>started: {selectedSummary.startedAt}</p> : null}
              {selectedSummary.finishedAt ? <p>finished: {selectedSummary.finishedAt}</p> : null}
            </div>

            {selectedSummary.blockers.length > 0 ? (
              <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                {selectedSummary.blockers.map((blocker) => (
                  <p key={`job-summary-blocker-${blocker.code}`}>
                    {blocker.code}: {describeDataSyncBlocker(blocker.code)}
                  </p>
                ))}
              </div>
            ) : null}

            {selectedSummary.failureSummary ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                {selectedSummary.failureSummary}
              </div>
            ) : null}

            {detail ? (
              <>
                {detail.tableResults.length > 0 ? (
                  <div className="rounded-sm border border-border bg-muted/20 p-2 text-[11px]">
                    <p className="mb-2 font-medium text-foreground">Table results</p>
                    <div className="space-y-1">
                      {detail.tableResults.map((result) => (
                        <p key={`${detail.jobId}-${result.tableName}-${result.action}`}>
                          {result.tableName} / {result.action} / attempted {result.attemptedRows} / ok{" "}
                          {result.succeededRows} / failed {result.failedRows}
                          {result.error ? ` / error: ${result.error}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {detail.sqlPreviewLines.length > 0 ? (
                  <pre className="max-h-64 overflow-auto rounded-sm border border-border bg-background p-2 font-mono text-[11px]">
                    {detail.sqlPreviewLines.join("\n")}
                  </pre>
                ) : null}
              </>
            ) : (
              <div className="rounded-sm border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
                Loading persisted job detail...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
