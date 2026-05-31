import type { HostApi } from "@/extensions/host-api";
import type { DbConnectionConfig } from "@shared/schema";
import type { WorkbenchResultWindowCapNotices } from "./use-workbench-result-window-cap-notices";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { WorkbenchQueryControllers } from "./use-workbench-query-controllers";
import { useWorkbenchRuntimeControllers } from "./use-workbench-runtime-controllers";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import type { WorkbenchWorkflowControllers } from "./use-workbench-workflow-controllers";
import type { WorkbenchTabController } from "./workbench-tab-controller";

type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutRuntimeControllerGroups {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  resultWindowCapNotices: WorkbenchResultWindowCapNotices;
  stateActionRegistries: WorkbenchStateActionRegistries;
  queryControllers: Pick<WorkbenchQueryControllers, "executeImmediate">;
  workflowControllers: Pick<
    WorkbenchWorkflowControllers,
    "handleInspectObject" | "handleRunStarterQuery"
  >;
  tabController: Pick<WorkbenchTabController, "updateActiveTabSql">;
  resultWindowLimit: number;
}

export function useWorkbenchLayoutRuntimeControllers(
  input: WorkbenchLayoutRuntimeControllerGroups,
) {
  const {
    connection,
    executionWorkspaceState,
    hostApi,
    operatorWorkspaceState,
    queryControllers,
    resultWindowCapNotices,
    resultWindowLimit,
    resultWorkspaceState,
    sqlWorkspaceState,
    stateActionRegistries,
    tabController,
    workflowControllers,
  } = input;

  return useWorkbenchRuntimeControllers({
    activeBatchIndex: resultWorkspaceState.activeBatchIndex,
    activeExportRequestIdRef: operatorWorkspaceState.activeExportRequestIdRef,
    connection,
    executeImmediate: queryControllers.executeImmediate,
    getWindowCapNoticeShown:
      resultWindowCapNotices.hasShownWindowCapNotice,
    gridCommitStateActions: stateActionRegistries.gridCommitStateActions,
    gridDraftActions: stateActionRegistries.gridDraftActions,
    handleInspectObject: workflowControllers.handleInspectObject,
    handleRunStarterQuery: workflowControllers.handleRunStarterQuery,
    hostApi,
    isCommittingGridEdit: operatorWorkspaceState.isCommittingGridEdit,
    isExecuting: executionWorkspaceState.isExecuting,
    isExporting: resultWorkspaceState.isExporting,
    lastGridEditSource: operatorWorkspaceState.lastGridEditSource,
    markWindowCapNoticeShown:
      resultWindowCapNotices.markWindowCapNoticeShown,
    pendingDeleteRows: operatorWorkspaceState.pendingDeleteRows,
    pendingEditCells: operatorWorkspaceState.pendingEditCells,
    pendingInsertedRows: operatorWorkspaceState.pendingInsertedRows,
    preparedGridPlan: operatorWorkspaceState.preparedGridPlan,
    requestLifecycleStateActions:
      stateActionRegistries.requestLifecycleStateActions,
    resultExportStateActions: stateActionRegistries.resultExportStateActions,
    resultWindowLimit,
    resultWorkspaceStateActions:
      stateActionRegistries.resultWorkspaceStateActions,
    results: executionWorkspaceState.results,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    selectedTableName: sqlWorkspaceState.selectedTableName,
    setLastGridEditSource: operatorWorkspaceState.setLastGridEditSource,
    setResults: executionWorkspaceState.setResults,
    updateActiveTabSql: tabController.updateActiveTabSql,
  });
}
