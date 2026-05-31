import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropResultInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const {
    operatorWorkspaceState,
    resultWorkspaceState,
    sqlWorkspaceState,
    workflowControllers,
  } = input;

  return {
    activeBatchIndex: resultWorkspaceState.activeBatchIndex,
    backgroundJobs: resultWorkspaceState.backgroundJobs,
    inspectError: operatorWorkspaceState.inspectError,
    isCommittingGridEdit: operatorWorkspaceState.isCommittingGridEdit,
    isExporting: resultWorkspaceState.isExporting,
    isInspectingObject: operatorWorkspaceState.isInspectingObject,
    isRefreshingJobs: resultWorkspaceState.isRefreshingJobs,
    jobCenterIssue: resultWorkspaceState.jobCenterIssue,
    lastGridEditSource: operatorWorkspaceState.lastGridEditSource,
    objectInspection: operatorWorkspaceState.objectInspection,
    pendingDeleteRows: operatorWorkspaceState.pendingDeleteRows,
    pendingEditCells: operatorWorkspaceState.pendingEditCells,
    pendingInsertedRows: operatorWorkspaceState.pendingInsertedRows,
    preparedGridPlan: operatorWorkspaceState.preparedGridPlan,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    selectedBackgroundJob: workflowControllers.selectedBackgroundJob,
    selectedJobId: resultWorkspaceState.selectedJobId,
    selectedTableName: sqlWorkspaceState.selectedTableName,
  };
}
