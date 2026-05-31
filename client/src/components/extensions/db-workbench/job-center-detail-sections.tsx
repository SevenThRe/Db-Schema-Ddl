import { Button } from "@/components/ui/button";
import type {
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "@shared/schema";
import {
  describeDataSyncBlocker,
  describeJobCenterConnection,
  formatDataSyncCounts,
  type JobCenterConnectionsById,
} from "./job-center-model";
import {
  JobCenterEmptyState,
  JobCenterStatusBadge,
} from "./job-center-shared-sections";

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
