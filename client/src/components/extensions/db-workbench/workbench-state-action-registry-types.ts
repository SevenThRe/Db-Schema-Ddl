import type { ToastOptions } from "@/extensions/host-api";
import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  DangerousSqlPreview,
  DbBackgroundJobSummary,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
  DbExplainPlan,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  DbSqlCopilotProbeResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import type { ObjectInspectionWorkspaceState } from "./object-inspection-runtime";
import type {
  PendingSqlParameterReview,
  PendingSqlScriptReview,
} from "./query-execution-gates";
import type { SchemaDiffWorkspaceState } from "./schema-diff-runtime";
import type { SqlCopilotGeneratedDraft } from "./sql-copilot-generation";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import type { SqlParameterInputValue } from "./sql-parameters";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import type { WorkbenchExecutionStateActions } from "./workbench-execution-action-registry";
import type { WorkbenchOperatorSurfaceStateActions } from "./workbench-operator-surface-action-registry";
import type { WorkbenchSqlStateActions } from "./workbench-sql-action-registry";
import type { WorkbenchSyncStateActions } from "./workbench-sync-action-registry";
import type {
  QueryRunHistoryEntry,
  QueryRunMode,
  SavedSqlSnippet,
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
} from "./workbench-session";

type Updater<T> = Dispatch<SetStateAction<T>>;

export interface WorkbenchStateActionRegistries {
  sqlStateActions: WorkbenchSqlStateActions;
  executionStateActions: WorkbenchExecutionStateActions;
  syncStateActions: WorkbenchSyncStateActions;
  operatorSurfaceStateActions: WorkbenchOperatorSurfaceStateActions;
  sqlCopilotStateActions: WorkbenchSqlStateActions["copilot"];
  sqlCopilotSettingsStateActions: WorkbenchSqlStateActions["copilotSettings"];
  sqlMemoryStateActions: WorkbenchSqlStateActions["memory"];
  sqlLibraryStateActions: WorkbenchSqlStateActions["library"];
  resultWorkspaceStateActions: WorkbenchExecutionStateActions["resultWorkspace"];
  resultExportStateActions: WorkbenchExecutionStateActions["resultExport"];
  queryExecutionStateActions: WorkbenchExecutionStateActions["queryExecution"];
  querySafetyStateActions: WorkbenchExecutionStateActions["querySafety"];
  requestLifecycleStateActions: WorkbenchExecutionStateActions["requestLifecycle"];
  dataApplyStateActions: WorkbenchSyncStateActions["dataApply"];
  dataDiffStateActions: WorkbenchSyncStateActions["dataDiff"];
  dataSyncDraftActions: WorkbenchSyncStateActions["dataSyncDraft"];
  syncConnectionStateActions: WorkbenchSyncStateActions["syncConnection"];
  jobCenterStateActions: WorkbenchSyncStateActions["jobCenter"];
  gridCommitStateActions: WorkbenchOperatorSurfaceStateActions["gridCommit"];
  gridDraftActions: WorkbenchOperatorSurfaceStateActions["gridDraft"];
  objectInspectionStateActions: WorkbenchOperatorSurfaceStateActions["objectInspection"];
  schemaDiffStateActions: WorkbenchOperatorSurfaceStateActions["schemaDiff"];
  navigationStateActions: WorkbenchOperatorSurfaceStateActions["navigation"];
  schemaStateActions: WorkbenchOperatorSurfaceStateActions["schema"];
}

export interface UseWorkbenchStateActionRegistriesInput {
  activeQueryRequestIdRef: MutableRefObject<string | null>;
  activeExportRequestIdRef: MutableRefObject<string | null>;
  clearShownWindowCapNotices: () => void;
  queryClient: QueryClient;
  showNotification: (notice: ToastOptions) => void;
  setActiveBatchIndex: (index: number) => void;
  setApplyExecute: Updater<DbDataApplyExecuteResponse | null>;
  setApplyJobDetail: (detail: DbDataApplyJobDetailResponse) => void;
  setApplyPreview: (preview: DbDataApplyPreviewResponse | null) => void;
  setApplyProdConfirmation: (confirmation: string) => void;
  setApplyUnsafeDeleteConfirmed: (confirmed: boolean) => void;
  setBackgroundJobs: Updater<DbBackgroundJobSummary[]>;
  setCurrentExportRequestId: (requestId: string | null) => void;
  setCurrentRequestId: (requestId: string | null) => void;
  setDangerPreview: (preview: DangerousSqlPreview | null) => void;
  setDiffDetail: (detail: DbDataDiffDetailResponse | null) => void;
  setDiffPreview: (preview: DbDataDiffPreviewResponse | null) => void;
  setDiffRows: Updater<DataSyncRowDiffEntry[]>;
  setExplainError: (message: string | null) => void;
  setExplainPlan: (plan: DbExplainPlan | null) => void;
  setInspectionState: (state: ObjectInspectionWorkspaceState) => void;
  setIsApplyPreviewing: (isPreviewing: boolean) => void;
  setIsCommittingGridEdit: (isCommitting: boolean) => void;
  setIsDiffPreviewing: (isPreviewing: boolean) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setIsExecutingApply: (isExecuting: boolean) => void;
  setIsExplaining: (isExplaining: boolean) => void;
  setIsExporting: (isExporting: boolean) => void;
  setIsGeneratingSqlCopilotDraft: (isGenerating: boolean) => void;
  setIsInspectingObject: (isInspecting: boolean) => void;
  setIsPreparingGridCommit: (isPreparing: boolean) => void;
  setIsRefreshingJobs: (isRefreshing: boolean) => void;
  setIsRunningSqlCopilotProbe: (isRunning: boolean) => void;
  setIsSavingSqlCopilotSettings: (isSaving: boolean) => void;
  setIsSchemaDiffing: (isDiffing: boolean) => void;
  setJobCenterIssue: (message: string | null) => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  setParameterValues: (values: Record<string, SqlParameterInputValue>) => void;
  setPendingCursorOffset: (cursorOffset: number | undefined) => void;
  setPendingDeleteRows: Updater<Record<string, DbGridDeleteRowDraft>>;
  setPendingEditCells: Updater<Record<string, DbGridEditPatchCell>>;
  setPendingInsertedRows: Updater<Record<string, DbGridInsertedRowDraft>>;
  setPendingParameterReview: (review: PendingSqlParameterReview | null) => void;
  setPendingQueryMode: (mode: QueryRunMode) => void;
  setPendingQuerySource: (source: DbGridEditSource | null) => void;
  setPendingScriptReview: (review: PendingSqlScriptReview | null) => void;
  setPendingSnippetName: (name: string) => void;
  setPendingSql: (sql: string | null) => void;
  setPreparedGridPlan: Updater<DbGridPrepareCommitResponse | null>;
  setQueryError: (message: string | null) => void;
  setQueryHistory: (queryHistory: QueryRunHistoryEntry[]) => void;
  setRecentQueries: (recentQueries: string[]) => void;
  setRestoredInspectionTarget: (target: WorkbenchInspectionTarget | null) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setResults: (results: QueryExecutionResponse | null) => void;
  setSaveSnippetDialogOpen: (open: boolean) => void;
  setSavedSnippets: (snippets: SavedSqlSnippet[]) => void;
  setSchemaDiffState: (state: SchemaDiffWorkspaceState) => void;
  setSchemaDiffTargetConnectionId: Updater<string>;
  setSelectedDiffRowIndex: (index: number) => void;
  setSelectedJobId: Updater<string | null>;
  setSelectedSqlLibraryEntryId: (entryId: string) => void;
  setSelectedTableName: Updater<string | null>;
  setShowDangerDialog: (open: boolean) => void;
  setSqlCopilotGeneratedDraft: (draft: SqlCopilotGeneratedDraft | null) => void;
  setSqlCopilotGenerationError: (message: string | null) => void;
  setSqlCopilotOpen: (open: boolean) => void;
  setSqlCopilotProbeError: (message: string | null) => void;
  setSqlCopilotProbeResult: (response: DbSqlCopilotProbeResponse) => void;
  setSqlCopilotSettingsDraft: Updater<SqlCopilotSettingsDraft>;
  setSqlLibraryOpen: (open: boolean) => void;
  setSqlLibrarySearch: (search: string) => void;
  setSqlMemory: (memory: SqlWorkbenchMemoryState) => void;
  setSqlMemoryOpen: (open: boolean) => void;
  setSyncIncludeUnchanged: (includeUnchanged: boolean) => void;
  setSyncIssue: (message: string | null) => void;
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTableConfigs: Updater<Record<string, SyncTableConfigDraft>>;
  setSyncSelectedTables: Updater<string[]>;
  setSyncTargetConnectionId: (connectionId: string) => void;
}
