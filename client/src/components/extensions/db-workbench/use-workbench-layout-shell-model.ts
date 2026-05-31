import type { HostApi } from "@/extensions/host-api";
import { readReleaseVerificationConfig } from "@/lib/release-verification";
import type { DbConnectionConfig } from "@shared/schema";
import { useWorkbenchLayoutControllerGraph } from "./use-workbench-layout-controller-graph";
import { useWorkbenchLayoutEffects } from "./use-workbench-layout-effects";
import { useWorkbenchLayoutRenderProps } from "./use-workbench-layout-render-props";
import { useWorkbenchLayoutWorkspaceState } from "./use-workbench-layout-workspace-state";

const DATA_SYNC_APPLY_READY_MESSAGE =
  "Apply executes real insert, update, and delete statements against the target connection. Review blockers and SQL preview before running it.";
const DATA_SYNC_DELETE_WARNING_THRESHOLD = 500;
const QUERY_RESULT_WINDOW_LIMIT = 5000;

export interface WorkbenchLayoutShellModelInput {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  onManageConnections: () => void;
  onSwitchConnection: (connectionId: string) => void;
  sidebarMode: "host" | "embedded";
}

export function useWorkbenchLayoutShellModel({
  connection,
  hostApi,
  onManageConnections,
  onSwitchConnection,
  sidebarMode,
}: WorkbenchLayoutShellModelInput) {
  const releaseVerification = readReleaseVerificationConfig();
  const workspaceState = useWorkbenchLayoutWorkspaceState({ connection });
  const {
    backendQueries,
    connectionRestoreActions,
    contextModels,
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
    stateActionRegistries,
    queryControllers,
    runtimeControllers,
    sqlControllers,
    tabController,
    workflowControllers,
  } = useWorkbenchLayoutControllerGraph({
    connection,
    hostApi,
    onSwitchConnection,
    workspaceState,
    dataSyncDeleteWarningThreshold: DATA_SYNC_DELETE_WARNING_THRESHOLD,
    resultWindowLimit: QUERY_RESULT_WINDOW_LIMIT,
  });

  useWorkbenchLayoutEffects({
    releaseVerification,
    connection,
    backendQueries,
    connectionRestoreActions,
    contextModels,
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
    stateActionRegistries,
    workflowControllers,
    runtimeControllers,
  });

  return useWorkbenchLayoutRenderProps({
    dataSyncApplyReadyMessage: DATA_SYNC_APPLY_READY_MESSAGE,
    dataSyncDeleteWarningThreshold: DATA_SYNC_DELETE_WARNING_THRESHOLD,
    backendQueries,
    connection,
    contextModels,
    executionWorkspaceState,
    onManageConnections,
    operatorWorkspaceState,
    queryControllers,
    resultWorkspaceState,
    runtimeControllers,
    sidebarMode,
    sqlControllers,
    sqlWorkspaceState,
    stateActionRegistries,
    syncWorkspaceState,
    tabController,
    workflowControllers,
  });
}
