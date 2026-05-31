import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropSyncInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { contextModels, syncWorkspaceState, workflowControllers } = input;
  const { syncSchemaContext } = contextModels;
  const schemaDiffState = syncWorkspaceState.schemaDiffState;

  return {
    activeApplyJobId: workflowControllers.activeApplyJobId,
    applyExecute: syncWorkspaceState.applyExecute,
    applyJobDetail: syncWorkspaceState.applyJobDetail,
    applyPreview: syncWorkspaceState.applyPreview,
    applyProdConfirmation: syncWorkspaceState.applyProdConfirmation,
    applyUnsafeDeleteConfirmed: syncWorkspaceState.applyUnsafeDeleteConfirmed,
    dataSyncApplyReadyMessage: input.dataSyncApplyReadyMessage,
    dataSyncDeleteWarningThreshold: input.dataSyncDeleteWarningThreshold,
    diffDetail: syncWorkspaceState.diffDetail,
    diffPreview: syncWorkspaceState.diffPreview,
    diffRows: syncWorkspaceState.diffRows,
    isApplyPreviewing: syncWorkspaceState.isApplyPreviewing,
    isDiffPreviewing: syncWorkspaceState.isDiffPreviewing,
    isExecutingApply: syncWorkspaceState.isExecutingApply,
    isSchemaDiffing: syncWorkspaceState.isSchemaDiffing,
    isSyncSchemaLoading: syncSchemaContext.isLoading,
    schemaDiffIssue: schemaDiffState.issue,
    schemaDiffResult: schemaDiffState.result,
    schemaDiffSourceSnapshot: schemaDiffState.sourceSnapshot,
    schemaDiffTargetConnectionId:
      syncWorkspaceState.schemaDiffTargetConnectionId,
    schemaDiffTargetSnapshot: schemaDiffState.targetSnapshot,
    selectedDiffRowIndex: syncWorkspaceState.selectedDiffRowIndex,
    syncAvailableTableNames: syncSchemaContext.availableTableNames,
    syncIncludeUnchanged: syncWorkspaceState.syncIncludeUnchanged,
    syncIssue: syncWorkspaceState.syncIssue,
    syncSchemaIssueMessage: syncSchemaContext.issueMessage,
    syncSelectedTables: syncWorkspaceState.syncSelectedTables,
    syncSourceConnectionId: syncWorkspaceState.syncSourceConnectionId,
    syncTableConfigs: syncWorkspaceState.syncTableConfigs,
    syncTableMetadataByName: syncSchemaContext.tableMetadataIndex,
    syncTargetConnectionId: syncWorkspaceState.syncTargetConnectionId,
  };
}
