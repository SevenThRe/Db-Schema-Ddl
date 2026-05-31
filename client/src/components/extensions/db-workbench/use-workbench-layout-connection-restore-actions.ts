import { useWorkbenchConnectionRestoreActions } from "./use-workbench-connection-restore-actions";
import type { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import type { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import type { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import type { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import type { WorkbenchStateActionRegistries } from "./use-workbench-state-action-registries";
import type { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";

type SqlWorkspaceState = ReturnType<typeof useWorkbenchSqlWorkspaceState>;
type ExecutionWorkspaceState = ReturnType<typeof useWorkbenchExecutionWorkspaceState>;
type ResultWorkspaceState = ReturnType<typeof useWorkbenchResultWorkspaceState>;
type SyncWorkspaceState = ReturnType<typeof useWorkbenchSyncWorkspaceState>;
type OperatorWorkspaceState = ReturnType<typeof useWorkbenchOperatorWorkspaceState>;

export interface WorkbenchLayoutConnectionRestoreActionGroups {
  sqlWorkspaceState: SqlWorkspaceState;
  executionWorkspaceState: ExecutionWorkspaceState;
  resultWorkspaceState: ResultWorkspaceState;
  syncWorkspaceState: SyncWorkspaceState;
  operatorWorkspaceState: OperatorWorkspaceState;
  stateActionRegistries: Pick<
    WorkbenchStateActionRegistries,
    "resultWorkspaceStateActions"
  >;
}

export function useWorkbenchLayoutConnectionRestoreActions(
  input: WorkbenchLayoutConnectionRestoreActionGroups,
) {
  const {
    executionWorkspaceState,
    operatorWorkspaceState,
    resultWorkspaceState,
    sqlWorkspaceState,
    stateActionRegistries,
    syncWorkspaceState,
  } = input;

  return useWorkbenchConnectionRestoreActions({
    setTabs: sqlWorkspaceState.setTabs,
    setActiveTabId: sqlWorkspaceState.setActiveTabId,
    setRecentQueries: sqlWorkspaceState.setRecentQueries,
    setQueryHistory: sqlWorkspaceState.setQueryHistory,
    setSqlMemory: sqlWorkspaceState.setSqlMemory,
    setSavedSnippets: sqlWorkspaceState.setSavedSnippets,
    setSelectedTableName: sqlWorkspaceState.setSelectedTableName,
    setActiveSchema: operatorWorkspaceState.setActiveSchema,
    setResultTab: stateActionRegistries.resultWorkspaceStateActions.selectResultTab,
    setRestoredInspectionTarget:
      operatorWorkspaceState.setRestoredInspectionTarget,
    setSqlLibraryOpen: sqlWorkspaceState.setSqlLibraryOpen,
    setSqlMemoryOpen: sqlWorkspaceState.setSqlMemoryOpen,
    setSqlCopilotOpen: sqlWorkspaceState.setSqlCopilotOpen,
    setSqlLibrarySearch: sqlWorkspaceState.setSqlLibrarySearch,
    setSelectedSqlLibraryEntryId:
      sqlWorkspaceState.setSelectedSqlLibraryEntryId,
    setSqlCopilotOperatorPrompt:
      sqlWorkspaceState.setSqlCopilotOperatorPrompt,
    setSqlCopilotProbeResult: sqlWorkspaceState.setSqlCopilotProbeResult,
    setSqlCopilotProbeError: sqlWorkspaceState.setSqlCopilotProbeError,
    setSqlCopilotGeneratedDraft:
      sqlWorkspaceState.setSqlCopilotGeneratedDraft,
    setSqlCopilotGenerationError:
      sqlWorkspaceState.setSqlCopilotGenerationError,
    setPendingParameterReview:
      executionWorkspaceState.setPendingParameterReview,
    setParameterValues: executionWorkspaceState.setParameterValues,
    setPendingScriptReview: executionWorkspaceState.setPendingScriptReview,
    setPendingEditCells: operatorWorkspaceState.setPendingEditCells,
    setPendingDeleteRows: operatorWorkspaceState.setPendingDeleteRows,
    setPendingInsertedRows: operatorWorkspaceState.setPendingInsertedRows,
    setPreparedGridPlan: operatorWorkspaceState.setPreparedGridPlan,
    setLastGridEditSource: operatorWorkspaceState.setLastGridEditSource,
    setInspectionState: operatorWorkspaceState.setInspectionState,
    setSchemaDiffTargetConnectionId:
      syncWorkspaceState.setSchemaDiffTargetConnectionId,
    setSyncSourceConnectionId: syncWorkspaceState.setSyncSourceConnectionId,
    setSyncTargetConnectionId: syncWorkspaceState.setSyncTargetConnectionId,
    setSelectedJobId: resultWorkspaceState.setSelectedJobId,
    setSyncSelectedTables: syncWorkspaceState.setSyncSelectedTables,
    setDiffPreview: syncWorkspaceState.setDiffPreview,
    setDiffDetail: syncWorkspaceState.setDiffDetail,
    setDiffRows: syncWorkspaceState.setDiffRows,
    setSelectedDiffRowIndex: syncWorkspaceState.setSelectedDiffRowIndex,
    setSyncIncludeUnchanged: syncWorkspaceState.setSyncIncludeUnchanged,
    setApplyPreview: syncWorkspaceState.setApplyPreview,
    setApplyExecute: syncWorkspaceState.setApplyExecute,
    setApplyJobDetail: syncWorkspaceState.setApplyJobDetail,
    setApplyProdConfirmation: syncWorkspaceState.setApplyProdConfirmation,
    setApplyUnsafeDeleteConfirmed:
      syncWorkspaceState.setApplyUnsafeDeleteConfirmed,
    setSyncIssue: syncWorkspaceState.setSyncIssue,
  });
}
