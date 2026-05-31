import type { DbConnectionConfig } from "@shared/schema";
import { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import { useWorkbenchContextModels } from "./use-workbench-context-models";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutContextModelGroups {
  connection: DbConnectionConfig;
  backendQueries: BackendQueries;
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
}

export function useWorkbenchLayoutContextModels(
  input: WorkbenchLayoutContextModelGroups,
) {
  const {
    backendQueries,
    connection,
    executionWorkspaceState,
    operatorWorkspaceState,
    sqlWorkspaceState,
    syncWorkspaceState,
  } = input;

  return useWorkbenchContextModels({
    syncSchema: {
      activeConnectionId: connection.id,
      connectionCount: backendQueries.connections.length,
      activeSchemaSnapshot: backendQueries.schemaSnapshot,
      activeSchemaError: backendQueries.schemaQueryError,
      sourceConnectionId: syncWorkspaceState.syncSourceConnectionId,
      targetConnectionId: syncWorkspaceState.syncTargetConnectionId,
      sourceSnapshotData: backendQueries.syncSourceSnapshotData ?? null,
      targetSnapshotData: backendQueries.syncTargetSnapshotData ?? null,
      sourceSnapshotError: backendQueries.syncSourceSnapshotError,
      targetSnapshotError: backendQueries.syncTargetSnapshotError,
      isSourceSnapshotLoading: backendQueries.isSyncSourceSnapshotLoading,
      isTargetSnapshotLoading: backendQueries.isSyncTargetSnapshotLoading,
    },
    schema: {
      connection,
      activeSchema: operatorWorkspaceState.activeSchema,
      runtimeSchema: operatorWorkspaceState.runtimeSchema,
      schemaOptionsRaw: backendQueries.schemaOptionsRaw,
      schemaSnapshot: backendQueries.schemaSnapshot,
      schemaQueryError: backendQueries.schemaQueryError,
      selectedTableName: sqlWorkspaceState.selectedTableName,
      sqlMemory: sqlWorkspaceState.sqlMemory,
    },
    sqlCopilot: {
      ddlSettings: backendQueries.ddlSettings,
      defaultDdlSettings: operatorWorkspaceState.defaultDdlSettings,
      settingsDraft: sqlWorkspaceState.sqlCopilotSettingsDraft,
      runtimeError: backendQueries.sqlCopilotRuntimeError,
      tabs: sqlWorkspaceState.tabs,
      activeTabId: sqlWorkspaceState.activeTabId,
      connection,
      schemaSnapshot: backendQueries.schemaSnapshot,
      sqlMemory: sqlWorkspaceState.sqlMemory,
      runtimeSchema: operatorWorkspaceState.runtimeSchema,
      selectedTableName: sqlWorkspaceState.selectedTableName,
      operatorPrompt: sqlWorkspaceState.sqlCopilotOperatorPrompt,
    },
    sqlWorkspace: {
      tabs: sqlWorkspaceState.tabs,
      activeTabId: sqlWorkspaceState.activeTabId,
      savedSnippets: sqlWorkspaceState.savedSnippets,
      recentQueries: sqlWorkspaceState.recentQueries,
      queryHistory: sqlWorkspaceState.queryHistory,
      sqlLibrarySearch: sqlWorkspaceState.sqlLibrarySearch,
      selectedSqlLibraryEntryId: sqlWorkspaceState.selectedSqlLibraryEntryId,
      pendingParameterReview: executionWorkspaceState.pendingParameterReview,
      parameterValues: executionWorkspaceState.parameterValues,
    },
  });
}
