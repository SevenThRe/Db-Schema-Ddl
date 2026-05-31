import type { QueryClient } from "@tanstack/react-query";
import type { HostApi } from "@/extensions/host-api";
import type { DbConnectionConfig } from "@shared/schema";
import type { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";
import type { WorkbenchQueryControllers } from "./use-workbench-query-controllers";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import { useWorkbenchWorkflowControllers } from "./use-workbench-workflow-controllers";
import type { WorkbenchTabController } from "./workbench-tab-controller";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;

export interface WorkbenchLayoutWorkflowControllerGroups {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  queryClient: QueryClient;
  onSwitchConnection: (connectionId: string) => void;
  backendQueries: BackendQueries;
  sqlWorkspaceState: SqlWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  stateActionRegistries: WorkbenchStateActionRegistries;
  queryControllers: Pick<WorkbenchQueryControllers, "handleExecute">;
  tabController: Pick<
    WorkbenchTabController,
    "focusSqlEditor" | "updateActiveTabSql"
  >;
  syncSchemaContext: {
    isLoading: boolean;
    issueMessage: string | null;
  };
  deleteWarningThreshold: number;
}

export function useWorkbenchLayoutWorkflowControllers(
  input: WorkbenchLayoutWorkflowControllerGroups,
) {
  const {
    backendQueries,
    connection,
    deleteWarningThreshold,
    hostApi,
    onSwitchConnection,
    operatorWorkspaceState,
    queryClient,
    queryControllers,
    resultWorkspaceState,
    sqlWorkspaceState,
    stateActionRegistries,
    syncSchemaContext,
    syncWorkspaceState,
    tabController,
  } = input;

  return useWorkbenchWorkflowControllers({
    activeSchema: operatorWorkspaceState.activeSchema,
    applyExecute: syncWorkspaceState.applyExecute,
    applyJobDetail: syncWorkspaceState.applyJobDetail,
    applyPreview: syncWorkspaceState.applyPreview,
    applyProdConfirmation: syncWorkspaceState.applyProdConfirmation,
    applyUnsafeDeleteConfirmed: syncWorkspaceState.applyUnsafeDeleteConfirmed,
    backgroundJobs: resultWorkspaceState.backgroundJobs,
    connection,
    dataApplyStateActions: stateActionRegistries.dataApplyStateActions,
    dataDiffStateActions: stateActionRegistries.dataDiffStateActions,
    dataSyncDraftActions: stateActionRegistries.dataSyncDraftActions,
    deleteWarningThreshold,
    diffDetail: syncWorkspaceState.diffDetail,
    diffPreview: syncWorkspaceState.diffPreview,
    diffRows: syncWorkspaceState.diffRows,
    executeQuery: async (sql, source) => {
      await queryControllers.handleExecute(sql, source);
    },
    focusSqlEditor: tabController.focusSqlEditor,
    hostApi,
    isSyncSchemaLoading: syncSchemaContext.isLoading,
    jobCenterStateActions: stateActionRegistries.jobCenterStateActions,
    navigationStateActions: stateActionRegistries.navigationStateActions,
    objectInspectionStateActions:
      stateActionRegistries.objectInspectionStateActions,
    onSwitchConnection,
    queryClient,
    refetchSchema: backendQueries.refetchSchema,
    refetchSchemaOptions: backendQueries.refetchSchemaOptions,
    restoredInspectionTarget: operatorWorkspaceState.restoredInspectionTarget,
    resultWorkspaceStateActions:
      stateActionRegistries.resultWorkspaceStateActions,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    schemaDiffStateActions: stateActionRegistries.schemaDiffStateActions,
    schemaDiffTargetConnectionId:
      syncWorkspaceState.schemaDiffTargetConnectionId,
    schemaSnapshot: backendQueries.schemaSnapshot,
    selectedJobId: resultWorkspaceState.selectedJobId,
    selectedTableName: sqlWorkspaceState.selectedTableName,
    setActiveSchema: operatorWorkspaceState.setActiveSchema,
    setLastGridEditSource: operatorWorkspaceState.setLastGridEditSource,
    setSyncIssue: syncWorkspaceState.setSyncIssue,
    syncIncludeUnchanged: syncWorkspaceState.syncIncludeUnchanged,
    syncSchemaIssueMessage: syncSchemaContext.issueMessage,
    syncSelectedTables: syncWorkspaceState.syncSelectedTables,
    syncSourceConnectionId: syncWorkspaceState.syncSourceConnectionId,
    syncTableConfigs: syncWorkspaceState.syncTableConfigs,
    syncTargetConnectionId: syncWorkspaceState.syncTargetConnectionId,
    updateActiveTabSql: tabController.updateActiveTabSql,
  });
}
