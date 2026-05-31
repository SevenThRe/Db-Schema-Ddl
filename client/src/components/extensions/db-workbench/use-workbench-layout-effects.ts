import type { ReleaseVerificationWindowConfig } from "@/lib/release-verification";
import type { DbConnectionConfig } from "@shared/schema";
import type { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchLayoutConnectionRestoreActions } from "./use-workbench-layout-connection-restore-actions";
import type { useWorkbenchLayoutContextModels } from "./use-workbench-layout-context-models";
import { useWorkbenchLayoutSessionEffects } from "./use-workbench-layout-session-effects";
import { useWorkbenchLayoutStateEffects } from "./use-workbench-layout-state-effects";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";
import { useWorkbenchInspectionEffects } from "./use-workbench-inspection-effects";
import { useWorkbenchLiveVerificationEffects } from "./use-workbench-live-verification-effects";
import { useWorkbenchResultEffects } from "./use-workbench-result-effects";
import type { WorkbenchRuntimeControllers } from "./use-workbench-runtime-controllers";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import { useWorkbenchSyncJobEffects } from "./use-workbench-sync-job-effects";
import type { WorkbenchWorkflowControllers } from "./use-workbench-workflow-controllers";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type ConnectionRestoreActions = ReturnType<
  typeof useWorkbenchLayoutConnectionRestoreActions
>;
type LayoutContextModels = ReturnType<typeof useWorkbenchLayoutContextModels>;
type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutEffectGroups {
  releaseVerification: ReleaseVerificationWindowConfig;
  connection: DbConnectionConfig;
  backendQueries: BackendQueries;
  connectionRestoreActions: ConnectionRestoreActions;
  contextModels: LayoutContextModels;
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  stateActionRegistries: WorkbenchStateActionRegistries;
  workflowControllers: Pick<
    WorkbenchWorkflowControllers,
    "handleRestoreInspectionTarget" | "syncJobController"
  >;
  runtimeControllers: Pick<WorkbenchRuntimeControllers, "liveVerificationRunner">;
}

export function useWorkbenchLayoutEffects(
  input: WorkbenchLayoutEffectGroups,
): void {
  const {
    backendQueries,
    connection,
    connectionRestoreActions,
    contextModels,
    executionWorkspaceState,
    operatorWorkspaceState,
    releaseVerification,
    resultWorkspaceState,
    runtimeControllers,
    sqlWorkspaceState,
    stateActionRegistries,
    syncWorkspaceState,
    workflowControllers,
  } = input;
  const { schemaContext, sqlWorkspaceContext, syncSchemaContext } = contextModels;

  useWorkbenchResultEffects({
    connectionId: connection.id,
    results: executionWorkspaceState.results,
    activeBatchIndex: resultWorkspaceState.activeBatchIndex,
    resultWorkspaceStateActions:
      stateActionRegistries.resultWorkspaceStateActions,
  });

  useWorkbenchLayoutStateEffects({
    connection,
    backendQueries,
    sqlWorkspaceState,
    syncWorkspaceState,
    syncSchemaContext,
    schemaContext,
    stateActionRegistries,
  });

  useWorkbenchLayoutSessionEffects({
    connection,
    connectionRestoreActions,
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
    sqlWorkspaceContext,
    stateActionRegistries,
  });

  useWorkbenchInspectionEffects({
    connectionId: connection.id,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    objectInspectionStateActions:
      stateActionRegistries.objectInspectionStateActions,
    restoreInspectionTarget: workflowControllers.handleRestoreInspectionTarget,
  });

  useWorkbenchSyncJobEffects({
    connectionId: connection.id,
    syncJobController: workflowControllers.syncJobController,
  });

  useWorkbenchLiveVerificationEffects({
    releaseVerification,
    connection,
    isSchemaLoading: backendQueries.isSchemaLoading,
    schemaSnapshot: backendQueries.schemaSnapshot ?? null,
    schemaErrorMessage: schemaContext.schemaErrorMessage,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    runKeyStore: operatorWorkspaceState.liveVerificationRunKeyRef,
    runner: runtimeControllers.liveVerificationRunner,
  });
}
