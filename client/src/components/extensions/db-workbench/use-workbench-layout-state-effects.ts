import type { DbConnectionConfig } from "@shared/schema";
import type { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import type { useWorkbenchLayoutContextModels } from "./use-workbench-layout-context-models";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import { useWorkbenchStateEffects } from "./use-workbench-state-effects";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type SyncSchemaContext = ReturnType<
  typeof useWorkbenchLayoutContextModels
>["syncSchemaContext"];
type SchemaContext = ReturnType<
  typeof useWorkbenchLayoutContextModels
>["schemaContext"];

export interface WorkbenchLayoutStateEffectGroups {
  connection: DbConnectionConfig;
  backendQueries: BackendQueries;
  sqlWorkspaceState: SqlWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  syncSchemaContext: Pick<SyncSchemaContext, "availableTableNames">;
  schemaContext: Pick<SchemaContext, "schemaErrorMessage">;
  stateActionRegistries: Pick<
    WorkbenchStateActionRegistries,
    | "dataDiffStateActions"
    | "schemaDiffStateActions"
    | "schemaStateActions"
    | "syncConnectionStateActions"
  >;
}

export function useWorkbenchLayoutStateEffects(
  input: WorkbenchLayoutStateEffectGroups,
): void {
  const {
    backendQueries,
    connection,
    schemaContext,
    sqlWorkspaceState,
    stateActionRegistries,
    syncSchemaContext,
    syncWorkspaceState,
  } = input;

  useWorkbenchStateEffects({
    activeConnectionId: connection.id,
    activeDriver: connection.driver,
    connections: backendQueries.connections,
    schemaDiffTargetConnectionId:
      syncWorkspaceState.schemaDiffTargetConnectionId,
    schemaDiffStateActions: stateActionRegistries.schemaDiffStateActions,
    syncSourceConnectionId: syncWorkspaceState.syncSourceConnectionId,
    syncTargetConnectionId: syncWorkspaceState.syncTargetConnectionId,
    syncConnectionStateActions:
      stateActionRegistries.syncConnectionStateActions,
    syncAvailableTableNames: syncSchemaContext.availableTableNames,
    selectedTableName: sqlWorkspaceState.selectedTableName,
    setSyncSelectedTables: syncWorkspaceState.setSyncSelectedTables,
    setSyncTableConfigs: syncWorkspaceState.setSyncTableConfigs,
    dataDiffStateActions: stateActionRegistries.dataDiffStateActions,
    schemaStateActions: stateActionRegistries.schemaStateActions,
    schemaErrorMessage: schemaContext.schemaErrorMessage,
    schemaOptionsError: backendQueries.schemaOptionsError,
    ddlSettings: backendQueries.ddlSettings,
    ddlSettingsError: backendQueries.ddlSettingsError,
    schemaTables: backendQueries.schemaSnapshot?.tables,
  });
}
