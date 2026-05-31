import type { HostApi } from "@/extensions/host-api";
import type { DbConnectionConfig } from "@shared/schema";
import type { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import { useWorkbenchQueryControllers } from "./use-workbench-query-controllers";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;

export interface WorkbenchLayoutQueryControllerGroups {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  backendQueries: BackendQueries;
  executionWorkspaceState: ExecutionWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  stateActionRegistries: WorkbenchStateActionRegistries;
}

export function useWorkbenchLayoutQueryControllers(
  input: WorkbenchLayoutQueryControllerGroups,
) {
  const {
    backendQueries,
    connection,
    executionWorkspaceState,
    hostApi,
    operatorWorkspaceState,
    resultWorkspaceState,
    stateActionRegistries,
  } = input;

  return useWorkbenchQueryControllers({
    activeQueryRequestIdRef: operatorWorkspaceState.activeQueryRequestIdRef,
    connection,
    currentExportRequestId: resultWorkspaceState.currentExportRequestId,
    currentRequestId: executionWorkspaceState.currentRequestId,
    hostApi,
    isExecuting: executionWorkspaceState.isExecuting,
    isExporting: resultWorkspaceState.isExporting,
    isExplaining: executionWorkspaceState.isExplaining,
    parameterValues: executionWorkspaceState.parameterValues,
    pendingCursorOffset: executionWorkspaceState.pendingCursorOffset,
    pendingParameterReview: executionWorkspaceState.pendingParameterReview,
    pendingQueryMode: executionWorkspaceState.pendingQueryMode,
    pendingQuerySource: executionWorkspaceState.pendingQuerySource,
    pendingScriptReview: executionWorkspaceState.pendingScriptReview,
    pendingSql: executionWorkspaceState.pendingSql,
    queryExecutionStateActions:
      stateActionRegistries.queryExecutionStateActions,
    querySafetyStateActions: stateActionRegistries.querySafetyStateActions,
    requestLifecycleStateActions:
      stateActionRegistries.requestLifecycleStateActions,
    resultWorkspaceStateActions:
      stateActionRegistries.resultWorkspaceStateActions,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    schemaTables: backendQueries.schemaSnapshot?.tables,
    setExplainError: executionWorkspaceState.setExplainError,
    setExplainPlan: executionWorkspaceState.setExplainPlan,
    setParameterValues: executionWorkspaceState.setParameterValues,
    stopOnError: executionWorkspaceState.stopOnError,
  });
}
