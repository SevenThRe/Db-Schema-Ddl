import type { QueryClient } from "@tanstack/react-query";
import type { ToastOptions } from "@/extensions/host-api";
import { useWorkbenchStateActionRegistryInput } from "./use-workbench-state-action-registry-input";
import type { WorkbenchResultWindowCapNotices } from "./use-workbench-result-window-cap-notices";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";

type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutStateActionInputGroups {
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  resultWindowCapNotices: WorkbenchResultWindowCapNotices;
  queryClient: QueryClient;
  showNotification: (notice: ToastOptions) => void;
}

export function useWorkbenchLayoutStateActionInput(
  input: WorkbenchLayoutStateActionInputGroups,
) {
  const {
    executionWorkspaceState,
    operatorWorkspaceState,
    queryClient,
    resultWindowCapNotices,
    resultWorkspaceState,
    showNotification,
    sqlWorkspaceState,
    syncWorkspaceState,
  } = input;

  return useWorkbenchStateActionRegistryInput({
    activeQueryRequestIdRef: operatorWorkspaceState.activeQueryRequestIdRef,
    activeExportRequestIdRef: operatorWorkspaceState.activeExportRequestIdRef,
    clearShownWindowCapNotices:
      resultWindowCapNotices.clearShownWindowCapNotices,
    queryClient,
    showNotification,
    setActiveBatchIndex: resultWorkspaceState.setActiveBatchIndex,
    setApplyExecute: syncWorkspaceState.setApplyExecute,
    setApplyJobDetail: syncWorkspaceState.setApplyJobDetail,
    setApplyPreview: syncWorkspaceState.setApplyPreview,
    setApplyProdConfirmation: syncWorkspaceState.setApplyProdConfirmation,
    setApplyUnsafeDeleteConfirmed:
      syncWorkspaceState.setApplyUnsafeDeleteConfirmed,
    setBackgroundJobs: resultWorkspaceState.setBackgroundJobs,
    setCurrentExportRequestId:
      resultWorkspaceState.setCurrentExportRequestId,
    setCurrentRequestId: executionWorkspaceState.setCurrentRequestId,
    setDangerPreview: executionWorkspaceState.setDangerPreview,
    setDiffDetail: syncWorkspaceState.setDiffDetail,
    setDiffPreview: syncWorkspaceState.setDiffPreview,
    setDiffRows: syncWorkspaceState.setDiffRows,
    setExplainError: executionWorkspaceState.setExplainError,
    setExplainPlan: executionWorkspaceState.setExplainPlan,
    setInspectionState: operatorWorkspaceState.setInspectionState,
    setIsApplyPreviewing: syncWorkspaceState.setIsApplyPreviewing,
    setIsCommittingGridEdit: operatorWorkspaceState.setIsCommittingGridEdit,
    setIsDiffPreviewing: syncWorkspaceState.setIsDiffPreviewing,
    setIsExecuting: executionWorkspaceState.setIsExecuting,
    setIsExecutingApply: syncWorkspaceState.setIsExecutingApply,
    setIsExplaining: executionWorkspaceState.setIsExplaining,
    setIsExporting: resultWorkspaceState.setIsExporting,
    setIsGeneratingSqlCopilotDraft:
      sqlWorkspaceState.setIsGeneratingSqlCopilotDraft,
    setIsInspectingObject: operatorWorkspaceState.setIsInspectingObject,
    setIsPreparingGridCommit: operatorWorkspaceState.setIsPreparingGridCommit,
    setIsRefreshingJobs: resultWorkspaceState.setIsRefreshingJobs,
    setIsRunningSqlCopilotProbe:
      sqlWorkspaceState.setIsRunningSqlCopilotProbe,
    setIsSavingSqlCopilotSettings:
      sqlWorkspaceState.setIsSavingSqlCopilotSettings,
    setIsSchemaDiffing: syncWorkspaceState.setIsSchemaDiffing,
    setJobCenterIssue: resultWorkspaceState.setJobCenterIssue,
    setLastGridEditSource: operatorWorkspaceState.setLastGridEditSource,
    setParameterValues: executionWorkspaceState.setParameterValues,
    setPendingCursorOffset: executionWorkspaceState.setPendingCursorOffset,
    setPendingDeleteRows: operatorWorkspaceState.setPendingDeleteRows,
    setPendingEditCells: operatorWorkspaceState.setPendingEditCells,
    setPendingInsertedRows: operatorWorkspaceState.setPendingInsertedRows,
    setPendingParameterReview:
      executionWorkspaceState.setPendingParameterReview,
    setPendingQueryMode: executionWorkspaceState.setPendingQueryMode,
    setPendingQuerySource: executionWorkspaceState.setPendingQuerySource,
    setPendingScriptReview: executionWorkspaceState.setPendingScriptReview,
    setPendingSnippetName: sqlWorkspaceState.setPendingSnippetName,
    setPendingSql: executionWorkspaceState.setPendingSql,
    setPreparedGridPlan: operatorWorkspaceState.setPreparedGridPlan,
    setQueryError: executionWorkspaceState.setQueryError,
    setQueryHistory: sqlWorkspaceState.setQueryHistory,
    setRecentQueries: sqlWorkspaceState.setRecentQueries,
    setRestoredInspectionTarget:
      operatorWorkspaceState.setRestoredInspectionTarget,
    setResultTab: executionWorkspaceState.setResultTab,
    setResults: executionWorkspaceState.setResults,
    setSaveSnippetDialogOpen: sqlWorkspaceState.setSaveSnippetDialogOpen,
    setSavedSnippets: sqlWorkspaceState.setSavedSnippets,
    setSchemaDiffState: syncWorkspaceState.setSchemaDiffState,
    setSchemaDiffTargetConnectionId:
      syncWorkspaceState.setSchemaDiffTargetConnectionId,
    setSelectedDiffRowIndex: syncWorkspaceState.setSelectedDiffRowIndex,
    setSelectedJobId: resultWorkspaceState.setSelectedJobId,
    setSelectedSqlLibraryEntryId:
      sqlWorkspaceState.setSelectedSqlLibraryEntryId,
    setSelectedTableName: sqlWorkspaceState.setSelectedTableName,
    setShowDangerDialog: executionWorkspaceState.setShowDangerDialog,
    setSqlCopilotGeneratedDraft:
      sqlWorkspaceState.setSqlCopilotGeneratedDraft,
    setSqlCopilotGenerationError:
      sqlWorkspaceState.setSqlCopilotGenerationError,
    setSqlCopilotOpen: sqlWorkspaceState.setSqlCopilotOpen,
    setSqlCopilotProbeError: sqlWorkspaceState.setSqlCopilotProbeError,
    setSqlCopilotProbeResult: sqlWorkspaceState.setSqlCopilotProbeResult,
    setSqlCopilotSettingsDraft:
      sqlWorkspaceState.setSqlCopilotSettingsDraft,
    setSqlLibraryOpen: sqlWorkspaceState.setSqlLibraryOpen,
    setSqlLibrarySearch: sqlWorkspaceState.setSqlLibrarySearch,
    setSqlMemory: sqlWorkspaceState.setSqlMemory,
    setSqlMemoryOpen: sqlWorkspaceState.setSqlMemoryOpen,
    setSyncIncludeUnchanged: syncWorkspaceState.setSyncIncludeUnchanged,
    setSyncIssue: syncWorkspaceState.setSyncIssue,
    setSyncSourceConnectionId: syncWorkspaceState.setSyncSourceConnectionId,
    setSyncTableConfigs: syncWorkspaceState.setSyncTableConfigs,
    setSyncSelectedTables: syncWorkspaceState.setSyncSelectedTables,
    setSyncTargetConnectionId: syncWorkspaceState.setSyncTargetConnectionId,
  });
}
