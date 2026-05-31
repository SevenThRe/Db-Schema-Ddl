import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ToastOptions } from "@/extensions/host-api";
import type {
  DangerousSqlPreview,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import {
  createResultWorkspaceStateActions,
  type ResultWorkspaceStateActions,
} from "./result-workspace-runner";
import {
  createResultExportStateActions,
  type ResultExportStateActions,
} from "./result-export-runner";
import {
  createQueryExecutionStateActions,
  type QueryExecutionStateActions,
  type QueryExecutionSessionUpdate,
} from "./query-execution-runner";
import {
  createQuerySafetyStateActions,
  type QuerySafetyStateActions,
} from "./query-safety-runner";
import {
  createRequestLifecycleStateActions,
  type RequestLifecycleStateActions,
} from "./request-lifecycle-runner";
import type { PendingSqlParameterReview, PendingSqlScriptReview } from "./query-execution-gates";
import type { SqlParameterInputValue } from "./sql-parameters";
import type { QueryRunMode, WorkbenchResultTab } from "./workbench-session";

export interface WorkbenchExecutionStateActions {
  resultWorkspace: ResultWorkspaceStateActions;
  resultExport: ResultExportStateActions;
  queryExecution: QueryExecutionStateActions;
  querySafety: QuerySafetyStateActions;
  requestLifecycle: RequestLifecycleStateActions;
}

export function createWorkbenchExecutionStateActions(input: {
  activeQueryRequestIdRef: MutableRefObject<string | null>;
  activeExportRequestIdRef: MutableRefObject<string | null>;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setResults: (results: QueryExecutionResponse | null) => void;
  setQueryError: (message: string | null) => void;
  setActiveBatchIndex: (index: number) => void;
  setPendingEditCells: Dispatch<SetStateAction<Record<string, DbGridEditPatchCell>>>;
  setPendingDeleteRows: Dispatch<SetStateAction<Record<string, DbGridDeleteRowDraft>>>;
  setPendingInsertedRows: Dispatch<SetStateAction<Record<string, DbGridInsertedRowDraft>>>;
  setPreparedGridPlan: Dispatch<SetStateAction<DbGridPrepareCommitResponse | null>>;
  clearShownWindowCapNotices: () => void;
  setCurrentExportRequestId: (requestId: string | null) => void;
  setIsExporting: (isExporting: boolean) => void;
  setCurrentRequestId: (requestId: string | null) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  showNotification: (notice: ToastOptions) => void;
  setRecentQueries: (recentQueries: QueryExecutionSessionUpdate["recentQueries"]) => void;
  setQueryHistory: (queryHistory: QueryExecutionSessionUpdate["queryHistory"]) => void;
  setSqlMemory: (sqlMemory: QueryExecutionSessionUpdate["sqlMemory"]) => void;
  setPendingSql: (sql: string | null) => void;
  setPendingCursorOffset: (cursorOffset: number | undefined) => void;
  setPendingQuerySource: (source: DbGridEditSource | null) => void;
  setPendingQueryMode: (mode: QueryRunMode) => void;
  setDangerPreview: (preview: DangerousSqlPreview | null) => void;
  setShowDangerDialog: (open: boolean) => void;
  setPendingParameterReview: (review: PendingSqlParameterReview | null) => void;
  setParameterValues: (values: Record<string, SqlParameterInputValue>) => void;
  setPendingScriptReview: (review: PendingSqlScriptReview | null) => void;
  setIsExplaining: (isExplaining: boolean) => void;
}): WorkbenchExecutionStateActions {
  const resultWorkspace = createResultWorkspaceStateActions({
    setResultTab: input.setResultTab,
    setResults: input.setResults,
    setQueryError: input.setQueryError,
    setActiveBatchIndex: input.setActiveBatchIndex,
    setPendingEditCells: input.setPendingEditCells,
    setPendingDeleteRows: input.setPendingDeleteRows,
    setPendingInsertedRows: input.setPendingInsertedRows,
    setPreparedGridPlan: input.setPreparedGridPlan,
    clearShownWindowCapNotices: input.clearShownWindowCapNotices,
  });

  return {
    resultWorkspace,
    resultExport: createResultExportStateActions({
      setActiveRequestId: (requestId) => {
        input.activeExportRequestIdRef.current = requestId;
      },
      getActiveRequestId: () => input.activeExportRequestIdRef.current,
      clearActiveRequestId: () => {
        input.activeExportRequestIdRef.current = null;
      },
      setCurrentRequestId: input.setCurrentExportRequestId,
      setIsExporting: input.setIsExporting,
    }),
    queryExecution: createQueryExecutionStateActions({
      setActiveRequestId: (requestId) => {
        input.activeQueryRequestIdRef.current = requestId;
      },
      getActiveRequestId: () => input.activeQueryRequestIdRef.current,
      clearActiveRequestId: () => {
        input.activeQueryRequestIdRef.current = null;
      },
      setCurrentRequestId: input.setCurrentRequestId,
      setIsExecuting: input.setIsExecuting,
      clearResults: resultWorkspace.clearResults,
      clearQueryError: resultWorkspace.clearQueryError,
      setResults: input.setResults,
      setLastGridEditSource: input.setLastGridEditSource,
      clearGridDrafts: resultWorkspace.clearGridDrafts,
      resetActiveBatchIndex: resultWorkspace.resetActiveBatchIndex,
      selectResultsTab: resultWorkspace.selectResultsTab,
      setQueryError: input.setQueryError,
      showNotification: input.showNotification,
      setRecentQueries: input.setRecentQueries,
      setQueryHistory: input.setQueryHistory,
      setSqlMemory: input.setSqlMemory,
    }),
    querySafety: createQuerySafetyStateActions({
      setPendingSql: input.setPendingSql,
      setPendingCursorOffset: input.setPendingCursorOffset,
      setPendingQuerySource: input.setPendingQuerySource,
      setPendingQueryMode: input.setPendingQueryMode,
      setQueryError: input.setQueryError,
      setDangerPreview: input.setDangerPreview,
      setShowDangerDialog: input.setShowDangerDialog,
      setPendingParameterReview: input.setPendingParameterReview,
      setParameterValues: input.setParameterValues,
      setPendingScriptReview: input.setPendingScriptReview,
    }),
    requestLifecycle: createRequestLifecycleStateActions({
      setIsExplaining: input.setIsExplaining,
      setActiveQueryRequestId: (requestId) => {
        input.activeQueryRequestIdRef.current = requestId;
      },
      getActiveQueryRequestId: () => input.activeQueryRequestIdRef.current,
      setCurrentRequestId: input.setCurrentRequestId,
      setIsExecuting: input.setIsExecuting,
      setActiveExportRequestId: (requestId) => {
        input.activeExportRequestIdRef.current = requestId;
      },
      setCurrentExportRequestId: input.setCurrentExportRequestId,
      setIsExporting: input.setIsExporting,
    }),
  };
}
