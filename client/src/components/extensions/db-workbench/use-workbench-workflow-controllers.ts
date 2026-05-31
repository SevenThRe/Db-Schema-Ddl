import { useWorkbenchInspectionDiffWorkflowController } from "./use-workbench-inspection-diff-workflow-controller";
import { useWorkbenchNavigationWorkflowController } from "./use-workbench-navigation-workflow-controller";
import { useWorkbenchSyncJobWorkflowController } from "./use-workbench-sync-job-workflow-controller";
import type {
  UseWorkbenchWorkflowControllersInput,
  WorkbenchWorkflowControllers,
} from "./workbench-workflow-controller-types";

export type {
  UseWorkbenchWorkflowControllersInput,
  WorkbenchWorkflowControllers,
} from "./workbench-workflow-controller-types";

export function useWorkbenchWorkflowControllers(
  input: UseWorkbenchWorkflowControllersInput,
): WorkbenchWorkflowControllers {
  const navigationController = useWorkbenchNavigationWorkflowController(input);
  const inspectionDiffController =
    useWorkbenchInspectionDiffWorkflowController(input);
  const { syncJobContext, syncJobController } =
    useWorkbenchSyncJobWorkflowController(input);

  return {
    handleOpenTable: navigationController.handleOpenTable,
    handleRunStarterQuery: navigationController.handleRunStarterQuery,
    handleSchemaChange: navigationController.handleSchemaChange,
    handleSelectTable: navigationController.handleSelectTable,
    handleSwitchConnection: navigationController.handleSwitchConnection,
    handleInspectObject: inspectionDiffController.handleInspectObject,
    handlePreviewSchemaDiff: inspectionDiffController.handlePreviewSchemaDiff,
    handleRestoreInspectionTarget:
      inspectionDiffController.handleRestoreInspectionTarget,
    selectedBackgroundJob: syncJobContext.selectedBackgroundJob,
    activeApplyJobId: syncJobContext.activeApplyJobId,
    activeApplyJobStatus: syncJobContext.activeApplyJobStatus,
    syncJobController,
    handleChangeSyncRowAction: syncJobController.handleChangeSyncRowAction,
    handleExecuteDataApply: syncJobController.handleExecuteDataApply,
    handleLoadDataDiffDetail: syncJobController.handleLoadDataDiffDetail,
    handleOpenJobCenterForJob: syncJobController.handleOpenJobCenterForJob,
    handlePreviewDataApply: syncJobController.handlePreviewDataApply,
    handlePreviewDataDiff: syncJobController.handlePreviewDataDiff,
    handleReopenSyncContext: syncJobController.handleReopenSyncContext,
    handleSyncTableConfigChange: syncJobController.handleSyncTableConfigChange,
    handleToggleIncludeUnchangedRows:
      syncJobController.handleToggleIncludeUnchangedRows,
    handleToggleSyncTable: syncJobController.handleToggleSyncTable,
    refreshBackgroundJobs: syncJobController.refreshBackgroundJobs,
  };
}
