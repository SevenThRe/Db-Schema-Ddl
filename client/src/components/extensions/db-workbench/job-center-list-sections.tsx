import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DbBackgroundJobSummary } from "@shared/schema";
import {
  describeJobCenterConnection,
  formatDataSyncCounts,
  type JobCenterConnectionsById,
} from "./job-center-model";
import {
  JobCenterEmptyState,
  JobCenterStatusBadge,
} from "./job-center-shared-sections";

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
