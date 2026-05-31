import { useMemo } from "react";
import type { WorkbenchExecutionStateActions } from "./workbench-execution-action-registry";
import {
  createWorkbenchSyncStateActions,
  type WorkbenchSyncStateActions,
} from "./workbench-sync-action-registry";
import type { UseWorkbenchStateActionRegistriesInput } from "./workbench-state-action-registry-types";

export function useWorkbenchSyncStateActions({
  input,
  resultWorkspaceStateActions,
}: {
  input: UseWorkbenchStateActionRegistriesInput;
  resultWorkspaceStateActions: WorkbenchExecutionStateActions["resultWorkspace"];
}): WorkbenchSyncStateActions {
  return useMemo(
    () =>
      createWorkbenchSyncStateActions({
        selectResultTab: resultWorkspaceStateActions.selectResultTab,
        setSyncIssue: input.setSyncIssue,
        setIsApplyPreviewing: input.setIsApplyPreviewing,
        setApplyPreview: input.setApplyPreview,
        setApplyUnsafeDeleteConfirmed: input.setApplyUnsafeDeleteConfirmed,
        setApplyProdConfirmation: input.setApplyProdConfirmation,
        setIsExecutingApply: input.setIsExecutingApply,
        setApplyExecute: input.setApplyExecute,
        updateApplyExecute: input.setApplyExecute,
        setSelectedJobId: input.setSelectedJobId,
        setApplyJobDetail: input.setApplyJobDetail,
        updateBackgroundJobs: input.setBackgroundJobs,
        setIsDiffPreviewing: input.setIsDiffPreviewing,
        setDiffPreview: input.setDiffPreview,
        setDiffDetail: input.setDiffDetail,
        setDiffRows: input.setDiffRows,
        setSelectedDiffRowIndex: input.setSelectedDiffRowIndex,
        updateSelectedTables: input.setSyncSelectedTables,
        updateTableConfigs: input.setSyncTableConfigs,
        updateRows: input.setDiffRows,
        setIncludeUnchanged: input.setSyncIncludeUnchanged,
        setSyncSourceConnectionId: input.setSyncSourceConnectionId,
        setSyncTargetConnectionId: input.setSyncTargetConnectionId,
        setIsRefreshingJobs: input.setIsRefreshingJobs,
        setJobCenterIssue: input.setJobCenterIssue,
        updateSelectedJobId: input.setSelectedJobId,
      }),
    [input, resultWorkspaceStateActions],
  );
}
