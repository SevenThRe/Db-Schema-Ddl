import type { HostApi } from "@/extensions/host-api";
import type { DbConnectionConfig } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import { useWorkbenchLayoutConnectionRestoreActions } from "./use-workbench-layout-connection-restore-actions";
import { useWorkbenchLayoutContextModels } from "./use-workbench-layout-context-models";
import { useWorkbenchLayoutQueryControllers } from "./use-workbench-layout-query-controllers";
import { useWorkbenchLayoutRuntimeControllers } from "./use-workbench-layout-runtime-controllers";
import { useWorkbenchLayoutSqlControllers } from "./use-workbench-layout-sql-controllers";
import { useWorkbenchLayoutStateActionInput } from "./use-workbench-layout-state-action-input";
import { useWorkbenchLayoutWorkflowControllers } from "./use-workbench-layout-workflow-controllers";
import type { useWorkbenchLayoutWorkspaceState } from "./use-workbench-layout-workspace-state";
import { useWorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import { useWorkbenchTabController } from "./use-workbench-tab-controller";

type WorkbenchLayoutWorkspaceState = ReturnType<
  typeof useWorkbenchLayoutWorkspaceState
>;

export interface WorkbenchLayoutControllerGraphInput {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  onSwitchConnection: (connectionId: string) => void;
  workspaceState: WorkbenchLayoutWorkspaceState;
  dataSyncDeleteWarningThreshold: number;
  resultWindowLimit: number;
}

export function useWorkbenchLayoutControllerGraph({
  connection,
  dataSyncDeleteWarningThreshold,
  hostApi,
  onSwitchConnection,
  resultWindowLimit,
  workspaceState,
}: WorkbenchLayoutControllerGraphInput) {
  const {
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWindowCapNotices,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
  } = workspaceState;
  const {
    activeTabId,
    setActiveTabId,
    setTabs,
    sqlCopilotOpen,
  } = sqlWorkspaceState;
  const {
    syncSourceConnectionId,
    syncTargetConnectionId,
  } = syncWorkspaceState;
  const { defaultDdlSettings } = operatorWorkspaceState;
  const queryClient = useQueryClient();

  const stateActionRegistriesInput = useWorkbenchLayoutStateActionInput({
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
    resultWindowCapNotices,
    queryClient,
    showNotification: hostApi.notifications.show,
  });
  const stateActionRegistries =
    useWorkbenchStateActionRegistries(stateActionRegistriesInput);

  const backendQueries = useWorkbenchBackendQueries({
    connection,
    hostApi,
    defaultDdlSettings,
    syncSourceConnectionId,
    syncTargetConnectionId,
    sqlCopilotOpen,
  });
  const contextModels = useWorkbenchLayoutContextModels({
    connection,
    backendQueries,
    sqlWorkspaceState,
    executionWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
  });

  const connectionRestoreActions = useWorkbenchLayoutConnectionRestoreActions({
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
    stateActionRegistries,
  });

  const tabController = useWorkbenchTabController({
    activeTabId,
    connectionId: connection.id,
    setActiveTabId,
    setTabs,
  });

  const queryControllers = useWorkbenchLayoutQueryControllers({
    connection,
    hostApi,
    backendQueries,
    executionWorkspaceState,
    operatorWorkspaceState,
    resultWorkspaceState,
    stateActionRegistries,
  });

  const sqlControllers = useWorkbenchLayoutSqlControllers({
    connection,
    hostApi,
    queryClient,
    backendQueries,
    contextModels,
    sqlWorkspaceState,
    operatorWorkspaceState,
    stateActionRegistries,
    queryControllers,
    tabController,
  });

  const workflowControllers = useWorkbenchLayoutWorkflowControllers({
    connection,
    hostApi,
    queryClient,
    onSwitchConnection,
    backendQueries,
    sqlWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
    resultWorkspaceState,
    stateActionRegistries,
    queryControllers,
    tabController,
    syncSchemaContext: contextModels.syncSchemaContext,
    deleteWarningThreshold: dataSyncDeleteWarningThreshold,
  });

  const runtimeControllers = useWorkbenchLayoutRuntimeControllers({
    connection,
    hostApi,
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWorkspaceState,
    operatorWorkspaceState,
    resultWindowCapNotices,
    stateActionRegistries,
    queryControllers,
    workflowControllers,
    tabController,
    resultWindowLimit,
  });

  return {
    backendQueries,
    connectionRestoreActions,
    contextModels,
    executionWorkspaceState,
    operatorWorkspaceState,
    queryControllers,
    resultWorkspaceState,
    runtimeControllers,
    sqlControllers,
    sqlWorkspaceState,
    stateActionRegistries,
    syncWorkspaceState,
    tabController,
    workflowControllers,
  };
}
