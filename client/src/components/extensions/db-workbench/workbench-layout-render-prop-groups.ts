import type { DbConnectionConfig, DbTableSchema } from "@shared/schema";
import type { useWorkbenchBackendQueries } from "./use-workbench-backend-queries";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchLayoutContextModels } from "./use-workbench-layout-context-models";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";
import type { WorkbenchQueryControllers } from "./use-workbench-query-controllers";
import type { WorkbenchRuntimeControllers } from "./use-workbench-runtime-controllers";
import type { WorkbenchSqlControllers } from "./use-workbench-sql-controllers";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import type { WorkbenchWorkflowControllers } from "./use-workbench-workflow-controllers";
import type { WorkbenchTabController } from "./workbench-tab-controller";
import type { WorkbenchLayoutProps } from "./WorkbenchLayout";

type BackendQueries = ReturnType<typeof useWorkbenchBackendQueries>;
type LayoutContextModels = ReturnType<typeof useWorkbenchLayoutContextModels>;
type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutRenderPropGroups {
  connection: DbConnectionConfig;
  onManageConnections: WorkbenchLayoutProps["onManageConnections"];
  sidebarMode: NonNullable<WorkbenchLayoutProps["sidebarMode"]>;
  dataSyncApplyReadyMessage: string;
  dataSyncDeleteWarningThreshold: number;
  backendQueries: BackendQueries;
  contextModels: LayoutContextModels;
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  stateActionRegistries: WorkbenchStateActionRegistries;
  tabController: WorkbenchTabController;
  queryControllers: WorkbenchQueryControllers;
  sqlControllers: WorkbenchSqlControllers;
  workflowControllers: WorkbenchWorkflowControllers;
  runtimeControllers: WorkbenchRuntimeControllers;
  /** Optional visual-table-designer wiring, supplied by WorkbenchLayout. */
  tableDesigner?: {
    open: boolean;
    sourceSchema: DbTableSchema | null;
    onApplyDdl: (sql: string) => void;
    onClose: () => void;
  };
}
