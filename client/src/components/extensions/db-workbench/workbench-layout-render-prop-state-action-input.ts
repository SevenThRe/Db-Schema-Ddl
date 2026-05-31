import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropStateActionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const {
    backendQueries,
    executionWorkspaceState,
    resultWorkspaceState,
    sqlWorkspaceState,
    stateActionRegistries,
    workflowControllers,
  } = input;

  return {
    dataApplyStateActions: stateActionRegistries.dataApplyStateActions,
    dataDiffStateActions: stateActionRegistries.dataDiffStateActions,
    gridCommitStateActions: stateActionRegistries.gridCommitStateActions,
    jobCenterStateActions: stateActionRegistries.jobCenterStateActions,
    onManageConnections: input.onManageConnections,
    refetchSchema: backendQueries.refetchSchema,
    refetchSchemaOptions: backendQueries.refetchSchemaOptions,
    refreshBackgroundJobs: workflowControllers.refreshBackgroundJobs,
    resultWorkspaceStateActions:
      stateActionRegistries.resultWorkspaceStateActions,
    schemaDiffStateActions: stateActionRegistries.schemaDiffStateActions,
    setActiveBatchIndex: resultWorkspaceState.setActiveBatchIndex,
    setPendingSnippetName: sqlWorkspaceState.setPendingSnippetName,
    setSelectedSqlLibraryEntryId:
      sqlWorkspaceState.setSelectedSqlLibraryEntryId,
    setSqlCopilotOperatorPrompt:
      sqlWorkspaceState.setSqlCopilotOperatorPrompt,
    setSqlLibrarySearch: sqlWorkspaceState.setSqlLibrarySearch,
    setStopOnError: executionWorkspaceState.setStopOnError,
    sqlCopilotStateActions: stateActionRegistries.sqlCopilotStateActions,
    sqlLibraryStateActions: stateActionRegistries.sqlLibraryStateActions,
    sqlMemoryStateActions: stateActionRegistries.sqlMemoryStateActions,
    syncConnectionStateActions:
      stateActionRegistries.syncConnectionStateActions,
  };
}
