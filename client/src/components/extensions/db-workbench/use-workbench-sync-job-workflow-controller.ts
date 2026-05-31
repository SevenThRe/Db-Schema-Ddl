import { useMemo } from "react";
import { createBrowserDataApplyPollingTimer } from "./data-apply-runner";
import { buildWorkbenchSyncJobContext } from "./workbench-sync-job-context";
import { createWorkbenchSyncJobController } from "./workbench-sync-job-controller";
import type { UseWorkbenchWorkflowControllersInput } from "./workbench-workflow-controller-types";

export function useWorkbenchSyncJobWorkflowController(
  input: UseWorkbenchWorkflowControllersInput,
) {
  const syncJobContext = useMemo(
    () =>
      buildWorkbenchSyncJobContext({
        backgroundJobs: input.backgroundJobs,
        selectedJobId: input.selectedJobId,
        applyExecute: input.applyExecute,
        applyJobDetail: input.applyJobDetail,
      }),
    [
      input.applyExecute,
      input.applyJobDetail,
      input.backgroundJobs,
      input.selectedJobId,
    ],
  );

  const syncJobController = useMemo(
    () =>
      createWorkbenchSyncJobController({
        isSyncSchemaLoading: input.isSyncSchemaLoading,
        syncSchemaIssueMessage: input.syncSchemaIssueMessage,
        syncSelectedTables: input.syncSelectedTables,
        selectedTableName: input.selectedTableName,
        syncTableConfigs: input.syncTableConfigs,
        sourceConnectionId: input.syncSourceConnectionId,
        targetConnectionId: input.syncTargetConnectionId,
        includeUnchanged: input.syncIncludeUnchanged,
        diffPreview: input.diffPreview,
        diffDetail: input.diffDetail,
        diffRows: input.diffRows,
        applyPreview: input.applyPreview,
        applyUnsafeDeleteConfirmed: input.applyUnsafeDeleteConfirmed,
        applyProdConfirmation: input.applyProdConfirmation,
        applyJobDetail: input.applyJobDetail,
        selectedJobId: input.selectedJobId,
        activeApplyJobId: syncJobContext.activeApplyJobId,
        activeApplyJobStatus: syncJobContext.activeApplyJobStatus,
        deleteWarningThreshold: input.deleteWarningThreshold,
        dataDiffActions: input.dataDiffStateActions,
        dataApplyActions: input.dataApplyStateActions,
        dataSyncDraftActions: input.dataSyncDraftActions,
        jobCenterActions: input.jobCenterStateActions,
        fetchDataDiffDetail: input.hostApi.connections.fetchDataDiffDetail,
        previewDataDiff: input.hostApi.connections.previewDataDiff,
        previewDataApply: input.hostApi.connections.previewDataApply,
        executeDataApply: input.hostApi.connections.executeDataApply,
        fetchDataApplyJobDetail: input.hostApi.connections.fetchDataApplyJobDetail,
        listBackgroundJobs: input.hostApi.connections.listBackgroundJobs,
        showNotification: input.hostApi.notifications.show,
        setSyncIssue: input.setSyncIssue,
        createPollingTimer: createBrowserDataApplyPollingTimer,
      }),
    [
      input.applyJobDetail,
      input.applyPreview,
      input.applyProdConfirmation,
      input.applyUnsafeDeleteConfirmed,
      input.dataApplyStateActions,
      input.dataDiffStateActions,
      input.dataSyncDraftActions,
      input.deleteWarningThreshold,
      input.diffDetail,
      input.diffPreview,
      input.diffRows,
      input.hostApi.connections,
      input.hostApi.notifications,
      input.isSyncSchemaLoading,
      input.jobCenterStateActions,
      input.selectedJobId,
      input.selectedTableName,
      input.setSyncIssue,
      input.syncIncludeUnchanged,
      input.syncSchemaIssueMessage,
      input.syncSelectedTables,
      input.syncSourceConnectionId,
      input.syncTableConfigs,
      input.syncTargetConnectionId,
      syncJobContext.activeApplyJobId,
      syncJobContext.activeApplyJobStatus,
    ],
  );

  return { syncJobContext, syncJobController };
}
