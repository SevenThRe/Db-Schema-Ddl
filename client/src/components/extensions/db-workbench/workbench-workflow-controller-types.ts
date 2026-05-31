import type { QueryClient } from "@tanstack/react-query";
import type { HostApi } from "@/extensions/host-api";
import type {
  DbBackgroundJobSummary,
  DbConnectionConfig,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
  DbGridEditSource,
  DbSchemaSnapshot,
} from "@shared/schema";
import type { DataApplyStateActions } from "./data-apply-runner";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import type { DataDiffStateActions } from "./data-sync-runner";
import type { DataSyncDraftActions } from "./data-sync-draft-runner";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import type { JobCenterStateActions } from "./job-center-runner";
import type { ObjectInspectionStateActions } from "./object-inspection-runner";
import type { SchemaDiffStateActions } from "./schema-diff-runner";
import type { NavigationStateActions } from "./workbench-navigation-runner";
import type { createWorkbenchInspectionDiffController } from "./workbench-inspection-diff-controller";
import type {
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
} from "./workbench-session";
import type { buildWorkbenchSyncJobContext } from "./workbench-sync-job-context";
import type { WorkbenchSyncJobController } from "./workbench-sync-job-controller";
import type { StarterQueryMode } from "./table-query-utils";

export interface WorkbenchWorkflowControllers {
  handleOpenTable: (tableName: string) => Promise<void>;
  handleRunStarterQuery: (
    tableName: string,
    mode: StarterQueryMode,
  ) => Promise<void>;
  handleSchemaChange: (nextSchema: string) => Promise<void>;
  handleSelectTable: (tableName: string) => void;
  handleSwitchConnection: (connectionId: string) => void;
  handleInspectObject: ReturnType<
    typeof createWorkbenchInspectionDiffController
  >["handleInspectObject"];
  handlePreviewSchemaDiff: () => Promise<void>;
  handleRestoreInspectionTarget: () => Promise<boolean>;
  selectedBackgroundJob: ReturnType<
    typeof buildWorkbenchSyncJobContext
  >["selectedBackgroundJob"];
  activeApplyJobId: string | null;
  activeApplyJobStatus: ReturnType<
    typeof buildWorkbenchSyncJobContext
  >["activeApplyJobStatus"];
  syncJobController: WorkbenchSyncJobController;
  handleChangeSyncRowAction: WorkbenchSyncJobController["handleChangeSyncRowAction"];
  handleExecuteDataApply: WorkbenchSyncJobController["handleExecuteDataApply"];
  handleLoadDataDiffDetail: WorkbenchSyncJobController["handleLoadDataDiffDetail"];
  handleOpenJobCenterForJob: WorkbenchSyncJobController["handleOpenJobCenterForJob"];
  handlePreviewDataApply: WorkbenchSyncJobController["handlePreviewDataApply"];
  handlePreviewDataDiff: WorkbenchSyncJobController["handlePreviewDataDiff"];
  handleReopenSyncContext: WorkbenchSyncJobController["handleReopenSyncContext"];
  handleSyncTableConfigChange: WorkbenchSyncJobController["handleSyncTableConfigChange"];
  handleToggleIncludeUnchangedRows: WorkbenchSyncJobController["handleToggleIncludeUnchangedRows"];
  handleToggleSyncTable: WorkbenchSyncJobController["handleToggleSyncTable"];
  refreshBackgroundJobs: WorkbenchSyncJobController["refreshBackgroundJobs"];
}

export interface UseWorkbenchWorkflowControllersInput {
  activeSchema: string;
  applyExecute: DbDataApplyExecuteResponse | null;
  applyJobDetail: DbDataApplyJobDetailResponse | null;
  applyPreview: DbDataApplyPreviewResponse | null;
  applyProdConfirmation: string;
  applyUnsafeDeleteConfirmed: boolean;
  backgroundJobs: DbBackgroundJobSummary[];
  connection: DbConnectionConfig;
  dataApplyStateActions: DataApplyStateActions;
  dataDiffStateActions: DataDiffStateActions;
  dataSyncDraftActions: DataSyncDraftActions;
  deleteWarningThreshold: number;
  diffDetail: DbDataDiffDetailResponse | null;
  diffPreview: DbDataDiffPreviewResponse | null;
  diffRows: DataSyncRowDiffEntry[];
  executeQuery: (sql: string, source: DbGridEditSource) => Promise<unknown>;
  focusSqlEditor: () => void;
  hostApi: HostApi;
  isSyncSchemaLoading: boolean;
  jobCenterStateActions: JobCenterStateActions;
  navigationStateActions: NavigationStateActions;
  objectInspectionStateActions: ObjectInspectionStateActions;
  onSwitchConnection: (connectionId: string) => void;
  queryClient: QueryClient;
  refetchSchema: () => Promise<unknown>;
  refetchSchemaOptions: () => Promise<unknown>;
  restoredInspectionTarget: WorkbenchInspectionTarget | null;
  resultWorkspaceStateActions: {
    selectResultTab: (tab: WorkbenchResultTab) => void;
  };
  runtimeSchema?: string;
  schemaDiffStateActions: SchemaDiffStateActions;
  schemaDiffTargetConnectionId: string;
  schemaSnapshot?: DbSchemaSnapshot | null;
  selectedJobId: string | null;
  selectedTableName: string | null;
  setActiveSchema: (schema: string) => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  setSyncIssue: (message: string | null) => void;
  syncIncludeUnchanged: boolean;
  syncSchemaIssueMessage: string | null;
  syncSelectedTables: string[];
  syncSourceConnectionId: string;
  syncTableConfigs: Record<string, SyncTableConfigDraft>;
  syncTargetConnectionId: string;
  updateActiveTabSql: (sql: string) => void;
}
