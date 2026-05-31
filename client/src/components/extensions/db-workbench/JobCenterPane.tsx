import type {
  DbBackgroundJobSummary,
  DbConnectionConfig,
  DbDataApplyJobDetailResponse,
} from "@shared/schema";
import {
  buildJobCenterConnectionsById,
  resolveJobCenterDetail,
  resolveJobCenterSelectedSummary,
} from "./job-center-model";
import {
  JobCenterDetailPane,
  JobCenterListPane,
} from "./job-center-sections";

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
  const connectionsById = buildJobCenterConnectionsById(connections);
  const selectedSummary = resolveJobCenterSelectedSummary(jobs, selectedJobId);
  const detail = resolveJobCenterDetail(selectedJobDetail, selectedSummary);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <JobCenterListPane
        jobs={jobs}
        selectedSummary={selectedSummary}
        connectionsById={connectionsById}
        activeConnectionId={activeConnectionId}
        isRefreshing={isRefreshing}
        issue={issue}
        onRefresh={onRefresh}
        onSelectJob={onSelectJob}
      />
      <JobCenterDetailPane
        selectedSummary={selectedSummary}
        detail={detail}
        connectionsById={connectionsById}
        onReopenSyncContext={onReopenSyncContext}
      />
    </div>
  );
}
