import type { QueryClient } from "@tanstack/react-query";
import type { HostApi } from "@/extensions/host-api";
import type { DbConnectionConfig } from "@shared/schema";
import type { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import type { useWorkbenchLayoutContextModels } from "./use-workbench-layout-context-models";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { WorkbenchQueryControllers } from "./use-workbench-query-controllers";
import { useWorkbenchSqlControllers } from "./use-workbench-sql-controllers";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import type { WorkbenchTabController } from "./workbench-tab-controller";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type LayoutContextModels = ReturnType<typeof useWorkbenchLayoutContextModels>;
type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutSqlControllerGroups {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  queryClient: QueryClient;
  backendQueries: BackendQueries;
  contextModels: LayoutContextModels;
  sqlWorkspaceState: SqlWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  stateActionRegistries: WorkbenchStateActionRegistries;
  queryControllers: Pick<
    WorkbenchQueryControllers,
    "handleExecute" | "handleExecuteScript"
  >;
  tabController: Pick<
    WorkbenchTabController,
    "focusSqlEditor" | "insertSqlIntoActiveTab" | "openSqlInNewTab"
  >;
}

export function useWorkbenchLayoutSqlControllers(
  input: WorkbenchLayoutSqlControllerGroups,
) {
  const {
    backendQueries,
    connection,
    contextModels,
    hostApi,
    operatorWorkspaceState,
    queryClient,
    queryControllers,
    sqlWorkspaceState,
    stateActionRegistries,
    tabController,
  } = input;
  const { sqlCopilotContext, sqlWorkspaceContext } = contextModels;

  return useWorkbenchSqlControllers({
    activeLabel: sqlWorkspaceContext.activeTab?.label,
    activeSql: sqlWorkspaceContext.activeTab?.sql ?? "",
    connectionId: connection.id,
    effectiveSettings: sqlCopilotContext.effectiveSettings,
    executeScript: queryControllers.handleExecuteScript,
    executeStatement: queryControllers.handleExecute,
    focusSqlEditor: tabController.focusSqlEditor,
    generatedDraft: sqlWorkspaceState.sqlCopilotGeneratedDraft,
    generationMode: sqlCopilotContext.generationMode,
    generationPromptPackage: sqlCopilotContext.generationPromptPackage,
    generationSemanticContext: sqlCopilotContext.generationSemanticContext,
    insertSqlIntoActiveTab: tabController.insertSqlIntoActiveTab,
    openSqlInNewTab: tabController.openSqlInNewTab,
    pendingSnippetName: sqlWorkspaceState.pendingSnippetName,
    promptPackage: sqlCopilotContext.promptPackage,
    queryClient,
    refetchSqlCopilotRuntime: backendQueries.refetchSqlCopilotRuntime,
    runSqlCopilotProbe: hostApi.connections.runSqlCopilotProbe,
    runtimeSchema: operatorWorkspaceState.runtimeSchema,
    selectedSqlLibraryEntry: sqlWorkspaceContext.selectedSqlLibraryEntry,
    showNotification: hostApi.notifications.show,
    sqlCopilotSettingsDirty: sqlCopilotContext.settingsDirty,
    sqlCopilotSettingsStateActions:
      stateActionRegistries.sqlCopilotSettingsStateActions,
    sqlCopilotStateActions: stateActionRegistries.sqlCopilotStateActions,
    sqlLibraryEntries: sqlWorkspaceContext.sqlLibraryEntries,
    sqlLibraryStateActions: stateActionRegistries.sqlLibraryStateActions,
    sqlMemoryStateActions: stateActionRegistries.sqlMemoryStateActions,
  });
}
