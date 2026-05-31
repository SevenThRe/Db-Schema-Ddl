import { useCallback, useState } from "react";
import type { HostApi } from "@/extensions/host-api";
import { readReleaseVerificationConfig } from "@/lib/release-verification";
import type { DbConnectionConfig, DbTableSchema } from "@shared/schema";
import { runApplyTableDesign } from "./table-designer-runner";
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

  // Visual table designer wiring. State lives here (top of the layout) where the
  // execution pipeline, notifications, and schema refetch are all available; the
  // dialog-props assembler derives driver/schema/readonly from the connection.
  const [tableDesignerOpen, setTableDesignerOpen] = useState(false);
  const [tableDesignerSource, setTableDesignerSource] = useState<DbTableSchema | null>(
    null,
  );

  const closeTableDesigner = useCallback(() => {
    setTableDesignerOpen(false);
    setTableDesignerSource(null);
  }, []);

  const openTableDesignerForNewTable = useCallback(() => {
    setTableDesignerSource(null);
    setTableDesignerOpen(true);
  }, []);

  const openTableDesignerForExistingTable = useCallback((schema: DbTableSchema) => {
    setTableDesignerSource(schema);
    setTableDesignerOpen(true);
  }, []);

  const handleApplyTableDesignDdl = useCallback(
    (sql: string) => {
      void runApplyTableDesign({
        script: sql,
        readonly: connection.readonly ?? false,
        executeScript: queryControllers.handleExecuteScript,
        notify: hostApi.notifications.show,
        closeDesigner: closeTableDesigner,
        refreshSchema: backendQueries.refetchSchema,
      });
    },
    [
      connection.readonly,
      queryControllers.handleExecuteScript,
      hostApi.notifications,
      backendQueries.refetchSchema,
      closeTableDesigner,
    ],
  );

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

  const renderProps = useWorkbenchLayoutRenderProps({
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
    tableDesigner: {
      open: tableDesignerOpen,
      sourceSchema: tableDesignerSource,
      onApplyDdl: handleApplyTableDesignDdl,
      onClose: closeTableDesigner,
    },
  });

  return {
    ...renderProps,
    /** Open the designer for a brand-new table (wired to a toolbar trigger). */
    onOpenTableDesigner: openTableDesignerForNewTable,
    /** Open the designer to edit an existing introspected table. */
    onDesignExistingTable: openTableDesignerForExistingTable,
  };
}
