import type { DbConnectionConfig } from "@shared/schema";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchLayoutConnectionRestoreActions } from "./use-workbench-layout-connection-restore-actions";
import type { useWorkbenchLayoutContextModels } from "./use-workbench-layout-context-models";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";
import { useWorkbenchSessionEffects } from "./use-workbench-session-effects";
import { saveSessionForConnection } from "./workbench-session";
import { hydrateConnectionSession } from "./workbench-session-hydration";

type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;
type SqlWorkspaceContext = ReturnType<
  typeof useWorkbenchLayoutContextModels
>["sqlWorkspaceContext"];
type ConnectionRestoreActions = ReturnType<
  typeof useWorkbenchLayoutConnectionRestoreActions
>;

export interface WorkbenchLayoutSessionEffectGroups {
  connection: DbConnectionConfig;
  connectionRestoreActions: ConnectionRestoreActions;
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  sqlWorkspaceContext: SqlWorkspaceContext;
  stateActionRegistries: Pick<
    WorkbenchStateActionRegistries,
    "sqlLibraryStateActions"
  >;
}

export function useWorkbenchLayoutSessionEffects(
  input: WorkbenchLayoutSessionEffectGroups,
): void {
  const {
    connection,
    connectionRestoreActions,
    executionWorkspaceState,
    operatorWorkspaceState,
    resultWorkspaceState,
    sqlWorkspaceContext,
    sqlWorkspaceState,
    stateActionRegistries,
    syncWorkspaceState,
  } = input;

  useWorkbenchSessionEffects({
    connection,
    hydrateSession: hydrateConnectionSession,
    connectionRestoreActions,
    sqlLibraryOpen: sqlWorkspaceState.sqlLibraryOpen,
    filteredSqlLibraryEntries: sqlWorkspaceContext.filteredSqlLibraryEntries,
    selectedSqlLibraryEntryId: sqlWorkspaceState.selectedSqlLibraryEntryId,
    sqlLibraryStateActions: stateActionRegistries.sqlLibraryStateActions,
    tabs: sqlWorkspaceState.tabs,
    activeTabId: sqlWorkspaceState.activeTabId,
    setTabs: sqlWorkspaceState.setTabs,
    setActiveTabId: sqlWorkspaceState.setActiveTabId,
    recentQueries: sqlWorkspaceState.recentQueries,
    queryHistory: sqlWorkspaceState.queryHistory,
    sqlMemory: sqlWorkspaceState.sqlMemory,
    savedSnippets: sqlWorkspaceState.savedSnippets,
    selectedTableName: sqlWorkspaceState.selectedTableName,
    activeSchema: operatorWorkspaceState.activeSchema,
    resultTab: executionWorkspaceState.resultTab,
    objectInspection: operatorWorkspaceState.objectInspection,
    restoredInspectionTarget: operatorWorkspaceState.restoredInspectionTarget,
    schemaDiffTargetConnectionId:
      syncWorkspaceState.schemaDiffTargetConnectionId,
    syncSourceConnectionId: syncWorkspaceState.syncSourceConnectionId,
    syncTargetConnectionId: syncWorkspaceState.syncTargetConnectionId,
    selectedJobId: resultWorkspaceState.selectedJobId,
    saveSession: saveSessionForConnection,
  });
}
