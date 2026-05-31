import { useWorkbenchExecutionStateActions } from "./use-workbench-execution-state-actions";
import { useWorkbenchOperatorSurfaceStateActions } from "./use-workbench-operator-surface-state-actions";
import { useWorkbenchSqlStateActions } from "./use-workbench-sql-state-actions";
import { useWorkbenchSyncStateActions } from "./use-workbench-sync-state-actions";
import type {
  UseWorkbenchStateActionRegistriesInput,
  WorkbenchStateActionRegistries,
} from "./workbench-state-action-registry-types";

export type {
  UseWorkbenchStateActionRegistriesInput,
  WorkbenchStateActionRegistries,
} from "./workbench-state-action-registry-types";

export function useWorkbenchStateActionRegistries(
  input: UseWorkbenchStateActionRegistriesInput,
): WorkbenchStateActionRegistries {
  const sqlStateActions = useWorkbenchSqlStateActions(input);
  const executionStateActions = useWorkbenchExecutionStateActions(input);
  const resultWorkspaceStateActions = executionStateActions.resultWorkspace;
  const syncStateActions = useWorkbenchSyncStateActions({
    input,
    resultWorkspaceStateActions,
  });
  const operatorSurfaceStateActions = useWorkbenchOperatorSurfaceStateActions({
    input,
    resultWorkspaceStateActions,
  });

  return {
    sqlStateActions,
    executionStateActions,
    syncStateActions,
    operatorSurfaceStateActions,
    sqlCopilotStateActions: sqlStateActions.copilot,
    sqlCopilotSettingsStateActions: sqlStateActions.copilotSettings,
    sqlMemoryStateActions: sqlStateActions.memory,
    sqlLibraryStateActions: sqlStateActions.library,
    resultWorkspaceStateActions,
    resultExportStateActions: executionStateActions.resultExport,
    queryExecutionStateActions: executionStateActions.queryExecution,
    querySafetyStateActions: executionStateActions.querySafety,
    requestLifecycleStateActions: executionStateActions.requestLifecycle,
    dataApplyStateActions: syncStateActions.dataApply,
    dataDiffStateActions: syncStateActions.dataDiff,
    dataSyncDraftActions: syncStateActions.dataSyncDraft,
    syncConnectionStateActions: syncStateActions.syncConnection,
    jobCenterStateActions: syncStateActions.jobCenter,
    gridCommitStateActions: operatorSurfaceStateActions.gridCommit,
    gridDraftActions: operatorSurfaceStateActions.gridDraft,
    objectInspectionStateActions: operatorSurfaceStateActions.objectInspection,
    schemaDiffStateActions: operatorSurfaceStateActions.schemaDiff,
    navigationStateActions: operatorSurfaceStateActions.navigation,
    schemaStateActions: operatorSurfaceStateActions.schema,
  };
}
