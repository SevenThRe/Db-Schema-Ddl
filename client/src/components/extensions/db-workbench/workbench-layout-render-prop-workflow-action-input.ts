import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropWorkflowActionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { workflowControllers } = input;

  return {
    handleChangeSyncRowAction: workflowControllers.handleChangeSyncRowAction,
    handleExecuteDataApply: workflowControllers.handleExecuteDataApply,
    handleInspectObject: workflowControllers.handleInspectObject,
    handleLoadDataDiffDetail: workflowControllers.handleLoadDataDiffDetail,
    handleOpenJobCenterForJob: workflowControllers.handleOpenJobCenterForJob,
    handleOpenTable: workflowControllers.handleOpenTable,
    handlePreviewDataApply: workflowControllers.handlePreviewDataApply,
    handlePreviewDataDiff: workflowControllers.handlePreviewDataDiff,
    handlePreviewSchemaDiff: workflowControllers.handlePreviewSchemaDiff,
    handleReopenSyncContext: workflowControllers.handleReopenSyncContext,
    handleRunStarterQuery: workflowControllers.handleRunStarterQuery,
    handleSchemaChange: workflowControllers.handleSchemaChange,
    handleSelectTable: workflowControllers.handleSelectTable,
    handleSwitchConnection: workflowControllers.handleSwitchConnection,
    handleSyncTableConfigChange:
      workflowControllers.handleSyncTableConfigChange,
    handleToggleIncludeUnchangedRows:
      workflowControllers.handleToggleIncludeUnchangedRows,
    handleToggleSyncTable: workflowControllers.handleToggleSyncTable,
  };
}
