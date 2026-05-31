import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "@shared/schema";
import {
  describeDataSyncBlocker,
  describeJobCenterConnection,
  formatDataSyncCounts,
  jobCenterStatusTone,
  type JobCenterConnectionsById,
} from "./job-center-model";

export function JobCenterListPane({
  jobs,
  selectedSummary,
  connectionsById,
  activeConnectionId,
  isRefreshing,
  issue,
  onRefresh,
  onSelectJob,
}: {
  jobs: DbBackgroundJobSummary[];
  selectedSummary: DbBackgroundJobSummary | null;
  connectionsById: JobCenterConnectionsById;
  activeConnectionId: string;
  isRefreshing: boolean;
  issue: string | null;
  onRefresh: () => void;
  onSelectJob: (jobId: string) => void;
}) {
  return (
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
          <JobCenterEmptyState message="No persisted background jobs yet. Data Sync apply history will appear here once jobs are executed." />
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobCenterListItem
                key={job.jobId}
                job={job}
                active={job.jobId === selectedSummary?.jobId}
                relatedToCurrentConnection={
                  job.sourceConnectionId === activeConnectionId ||
                  job.targetConnectionId === activeConnectionId
                }
                connectionsById={connectionsById}
                onSelectJob={onSelectJob}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCenterListItem({
  job,
  active,
  relatedToCurrentConnection,
  connectionsById,
  onSelectJob,
}: {
  job: DbBackgroundJobSummary;
  active: boolean;
  relatedToCurrentConnection: boolean;
  connectionsById: JobCenterConnectionsById;
  onSelectJob: (jobId: string) => void;
}) {
  return (
    <button
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
        <JobCenterStatusBadge status={job.status} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {formatDataSyncCounts(job.statusCounts)}
      </p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {describeJobCenterConnection(connectionsById, job.sourceConnectionId)}{" "}
        -&gt;{" "}
        {describeJobCenterConnection(connectionsById, job.targetConnectionId)}
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
}

export function JobCenterDetailPane({
  selectedSummary,
  detail,
  connectionsById,
  onReopenSyncContext,
}: {
  selectedSummary: DbBackgroundJobSummary | null;
  detail: DbDataApplyJobDetailResponse | null;
  connectionsById: JobCenterConnectionsById;
  onReopenSyncContext: (jobId: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 overflow-auto bg-background p-3">
      {!selectedSummary ? (
        <JobCenterEmptyState message="Select a recent job to review its audit trail and reopen related sync context." />
      ) : (
        <div className="space-y-3">
          <JobCenterDetailHeader
            selectedSummary={selectedSummary}
            onReopenSyncContext={onReopenSyncContext}
          />
          <JobCenterDetailMetrics
            selectedSummary={selectedSummary}
            connectionsById={connectionsById}
          />
          <JobCenterTimeline selectedSummary={selectedSummary} />
          <JobCenterBlockers selectedSummary={selectedSummary} />
          <JobCenterFailureSummary selectedSummary={selectedSummary} />
          <JobCenterPersistedDetail detail={detail} />
        </div>
      )}
    </div>
  );
}

function JobCenterDetailHeader({
  selectedSummary,
  onReopenSyncContext,
}: {
  selectedSummary: DbBackgroundJobSummary;
  onReopenSyncContext: (jobId: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-mono text-sm font-semibold">
          {selectedSummary.jobId}
        </p>
        <p className="text-xs text-muted-foreground">
          {selectedSummary.title} / {selectedSummary.jobKind}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <JobCenterStatusBadge status={selectedSummary.status} />
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
  );
}

function JobCenterDetailMetrics({
  selectedSummary,
  connectionsById,
}: {
  selectedSummary: DbBackgroundJobSummary;
  connectionsById: JobCenterConnectionsById;
}) {
  return (
    <div className="grid gap-2 text-[11px] text-muted-foreground md:grid-cols-2">
      <JobCenterMetric label="Source">
        {describeJobCenterConnection(
          connectionsById,
          selectedSummary.sourceConnectionId,
        )}
      </JobCenterMetric>
      <JobCenterMetric label="Target">
        {describeJobCenterConnection(
          connectionsById,
          selectedSummary.targetConnectionId,
        )}
      </JobCenterMetric>
      <JobCenterMetric label="Counts">
        {formatDataSyncCounts(selectedSummary.statusCounts)}
      </JobCenterMetric>
      <JobCenterMetric label="Statements">
        {selectedSummary.statementCount}
        {selectedSummary.previewTruncated ? " / preview truncated" : ""}
      </JobCenterMetric>
    </div>
  );
}

function JobCenterTimeline({
  selectedSummary,
}: {
  selectedSummary: DbBackgroundJobSummary;
}) {
  return (
    <div className="rounded-sm border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
      <p>created: {selectedSummary.createdAt}</p>
      {selectedSummary.startedAt ? (
        <p>started: {selectedSummary.startedAt}</p>
      ) : null}
      {selectedSummary.finishedAt ? (
        <p>finished: {selectedSummary.finishedAt}</p>
      ) : null}
    </div>
  );
}

function JobCenterBlockers({
  selectedSummary,
}: {
  selectedSummary: DbBackgroundJobSummary;
}) {
  if (selectedSummary.blockers.length === 0) {
    return null;
  }

  return (
    <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
      {selectedSummary.blockers.map((blocker) => (
        <p key={`job-summary-blocker-${blocker.code}`}>
          {blocker.code}: {describeDataSyncBlocker(blocker.code)}
        </p>
      ))}
    </div>
  );
}

function JobCenterFailureSummary({
  selectedSummary,
}: {
  selectedSummary: DbBackgroundJobSummary;
}) {
  if (!selectedSummary.failureSummary) {
    return null;
  }

  return (
    <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
      {selectedSummary.failureSummary}
    </div>
  );
}

function JobCenterPersistedDetail({
  detail,
}: {
  detail: DbDataApplyJobDetailResponse | null;
}) {
  if (!detail) {
    return (
      <JobCenterEmptyState message="Loading persisted job detail..." />
    );
  }

  return (
    <>
      {detail.tableResults.length > 0 ? (
        <div className="rounded-sm border border-border bg-muted/20 p-2 text-[11px]">
          <p className="mb-2 font-medium text-foreground">Table results</p>
          <div className="space-y-1">
            {detail.tableResults.map((result) => (
              <p key={`${detail.jobId}-${result.tableName}-${result.action}`}>
                {result.tableName} / {result.action} / attempted{" "}
                {result.attemptedRows} / ok {result.succeededRows} / failed{" "}
                {result.failedRows}
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
  );
}

function JobCenterMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-muted/20 p-2">
      <p className="font-medium text-foreground">{label}</p>
      <p>{children}</p>
    </div>
  );
}

function JobCenterStatusBadge({
  status,
}: {
  status: DbBackgroundJobSummary["status"];
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm border-0 text-[10px]", jobCenterStatusTone(status))}
    >
      {status}
    </Badge>
  );
}

function JobCenterEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
      {message}
    </div>
  );
}
