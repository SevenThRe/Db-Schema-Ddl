import type {
  DbConnectionConfig,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  DbSqlCopilotProbeResponse,
} from "@shared/schema";
import type { QueryTab } from "./query-tabs-storage";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import { createEmptyObjectInspectionState } from "./object-inspection-runtime";
import type { PendingSqlParameterReview, PendingSqlScriptReview } from "./query-execution-gates";
import type { SqlParameterInputValue } from "./sql-parameters";
import type { SqlCopilotGeneratedDraft } from "./sql-copilot-generation";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import type {
  HydratedConnectionSession,
} from "./workbench-session-hydration";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
} from "./workbench-session";
import { resolveRestoredActiveSchema } from "./workbench-session-runtime";

export interface WorkbenchConnectionRestoreActions {
  setTabs: (tabs: QueryTab[]) => void;
  setActiveTabId: (tabId: string) => void;
  setRecentQueries: (queries: string[]) => void;
  setQueryHistory: (history: QueryRunHistoryEntry[]) => void;
  setSqlMemory: (memory: SqlWorkbenchMemoryState) => void;
  setSavedSnippets: (snippets: SavedSqlSnippet[]) => void;
  setSelectedTableName: (tableName: string | null) => void;
  setActiveSchema: (schema: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setRestoredInspectionTarget: (target: WorkbenchInspectionTarget | null) => void;
  setSqlLibraryOpen: (open: boolean) => void;
  setSqlMemoryOpen: (open: boolean) => void;
  setSqlCopilotOpen: (open: boolean) => void;
  setSqlLibrarySearch: (search: string) => void;
  setSelectedSqlLibraryEntryId: (entryId: string) => void;
  setSqlCopilotOperatorPrompt: (prompt: string) => void;
  setSqlCopilotProbeResult: (result: DbSqlCopilotProbeResponse | null) => void;
  setSqlCopilotProbeError: (message: string | null) => void;
  setSqlCopilotGeneratedDraft: (draft: SqlCopilotGeneratedDraft | null) => void;
  setSqlCopilotGenerationError: (message: string | null) => void;
  setPendingParameterReview: (review: PendingSqlParameterReview | null) => void;
  setParameterValues: (values: Record<string, SqlParameterInputValue>) => void;
  setPendingScriptReview: (review: PendingSqlScriptReview | null) => void;
  setPendingEditCells: (cells: Record<string, DbGridEditPatchCell>) => void;
  setPendingDeleteRows: (rows: Record<string, DbGridDeleteRowDraft>) => void;
  setPendingInsertedRows: (rows: Record<string, DbGridInsertedRowDraft>) => void;
  setPreparedGridPlan: (plan: DbGridPrepareCommitResponse | null) => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  setInspectionState: (state: ReturnType<typeof createEmptyObjectInspectionState>) => void;
  setSchemaDiffTargetConnectionId: (connectionId: string) => void;
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
  setSelectedJobId: (jobId: string | null) => void;
  setSyncSelectedTables: (tables: string[]) => void;
  setDiffPreview: (preview: DbDataDiffPreviewResponse | null) => void;
  setDiffDetail: (detail: DbDataDiffDetailResponse | null) => void;
  setDiffRows: (rows: DataSyncRowDiffEntry[]) => void;
  setSelectedDiffRowIndex: (index: number) => void;
  setSyncIncludeUnchanged: (includeUnchanged: boolean) => void;
  setApplyPreview: (preview: DbDataApplyPreviewResponse | null) => void;
  setApplyExecute: (execute: DbDataApplyExecuteResponse | null) => void;
  setApplyJobDetail: (detail: DbDataApplyJobDetailResponse | null) => void;
  setApplyProdConfirmation: (confirmation: string) => void;
  setApplyUnsafeDeleteConfirmed: (confirmed: boolean) => void;
  setSyncIssue: (message: string | null) => void;
}

export function createWorkbenchConnectionRestoreActions(
  input: WorkbenchConnectionRestoreActions,
): WorkbenchConnectionRestoreActions {
  return {
    setTabs: input.setTabs,
    setActiveTabId: input.setActiveTabId,
    setRecentQueries: input.setRecentQueries,
    setQueryHistory: input.setQueryHistory,
    setSqlMemory: input.setSqlMemory,
    setSavedSnippets: input.setSavedSnippets,
    setSelectedTableName: input.setSelectedTableName,
    setActiveSchema: input.setActiveSchema,
    setResultTab: input.setResultTab,
    setRestoredInspectionTarget: input.setRestoredInspectionTarget,
    setSqlLibraryOpen: input.setSqlLibraryOpen,
    setSqlMemoryOpen: input.setSqlMemoryOpen,
    setSqlCopilotOpen: input.setSqlCopilotOpen,
    setSqlLibrarySearch: input.setSqlLibrarySearch,
    setSelectedSqlLibraryEntryId: input.setSelectedSqlLibraryEntryId,
    setSqlCopilotOperatorPrompt: input.setSqlCopilotOperatorPrompt,
    setSqlCopilotProbeResult: input.setSqlCopilotProbeResult,
    setSqlCopilotProbeError: input.setSqlCopilotProbeError,
    setSqlCopilotGeneratedDraft: input.setSqlCopilotGeneratedDraft,
    setSqlCopilotGenerationError: input.setSqlCopilotGenerationError,
    setPendingParameterReview: input.setPendingParameterReview,
    setParameterValues: input.setParameterValues,
    setPendingScriptReview: input.setPendingScriptReview,
    setPendingEditCells: input.setPendingEditCells,
    setPendingDeleteRows: input.setPendingDeleteRows,
    setPendingInsertedRows: input.setPendingInsertedRows,
    setPreparedGridPlan: input.setPreparedGridPlan,
    setLastGridEditSource: input.setLastGridEditSource,
    setInspectionState: input.setInspectionState,
    setSchemaDiffTargetConnectionId: input.setSchemaDiffTargetConnectionId,
    setSyncSourceConnectionId: input.setSyncSourceConnectionId,
    setSyncTargetConnectionId: input.setSyncTargetConnectionId,
    setSelectedJobId: input.setSelectedJobId,
    setSyncSelectedTables: input.setSyncSelectedTables,
    setDiffPreview: input.setDiffPreview,
    setDiffDetail: input.setDiffDetail,
    setDiffRows: input.setDiffRows,
    setSelectedDiffRowIndex: input.setSelectedDiffRowIndex,
    setSyncIncludeUnchanged: input.setSyncIncludeUnchanged,
    setApplyPreview: input.setApplyPreview,
    setApplyExecute: input.setApplyExecute,
    setApplyJobDetail: input.setApplyJobDetail,
    setApplyProdConfirmation: input.setApplyProdConfirmation,
    setApplyUnsafeDeleteConfirmed: input.setApplyUnsafeDeleteConfirmed,
    setSyncIssue: input.setSyncIssue,
  };
}

export interface RunWorkbenchConnectionRestoreInput {
  connection: Pick<DbConnectionConfig, "id" | "driver" | "defaultSchema">;
  hydrateSession: (connectionId: string) => HydratedConnectionSession;
  actions: WorkbenchConnectionRestoreActions;
}

export function runWorkbenchConnectionRestore(
  input: RunWorkbenchConnectionRestoreInput,
): HydratedConnectionSession {
  const restored = input.hydrateSession(input.connection.id);
  const actions = input.actions;

  actions.setTabs(restored.tabs);
  actions.setActiveTabId(restored.activeTabId);
  actions.setRecentQueries(restored.recentQueries);
  actions.setQueryHistory(restored.queryHistory);
  actions.setSqlMemory(restored.sqlMemory);
  actions.setSavedSnippets(restored.snippets);
  actions.setSelectedTableName(restored.selectedTableName);
  actions.setActiveSchema(resolveRestoredActiveSchema({
    driver: input.connection.driver,
    restoredActiveSchema: restored.activeSchema,
    defaultSchema: input.connection.defaultSchema,
  }));
  actions.setResultTab(restored.lastResultTab);
  actions.setRestoredInspectionTarget(restored.inspectionTarget);
  actions.setSqlLibraryOpen(false);
  actions.setSqlMemoryOpen(false);
  actions.setSqlCopilotOpen(false);
  actions.setSqlLibrarySearch("");
  actions.setSelectedSqlLibraryEntryId("");
  actions.setSqlCopilotOperatorPrompt("");
  actions.setSqlCopilotProbeResult(null);
  actions.setSqlCopilotProbeError(null);
  actions.setSqlCopilotGeneratedDraft(null);
  actions.setSqlCopilotGenerationError(null);
  actions.setPendingParameterReview(null);
  actions.setParameterValues({});
  actions.setPendingScriptReview(null);
  actions.setPendingEditCells({});
  actions.setPendingDeleteRows({});
  actions.setPendingInsertedRows({});
  actions.setPreparedGridPlan(null);
  actions.setLastGridEditSource(null);
  actions.setInspectionState(createEmptyObjectInspectionState());
  actions.setSchemaDiffTargetConnectionId(restored.schemaDiffTargetConnectionId ?? "");
  actions.setSyncSourceConnectionId(restored.syncSourceConnectionId ?? input.connection.id);
  actions.setSyncTargetConnectionId(restored.syncTargetConnectionId ?? input.connection.id);
  actions.setSelectedJobId(restored.selectedJobId);
  actions.setSyncSelectedTables([]);
  actions.setDiffPreview(null);
  actions.setDiffDetail(null);
  actions.setDiffRows([]);
  actions.setSelectedDiffRowIndex(0);
  actions.setSyncIncludeUnchanged(false);
  actions.setApplyPreview(null);
  actions.setApplyExecute(null);
  actions.setApplyJobDetail(null);
  actions.setApplyProdConfirmation("");
  actions.setApplyUnsafeDeleteConfirmed(false);
  actions.setSyncIssue(null);

  return restored;
}
