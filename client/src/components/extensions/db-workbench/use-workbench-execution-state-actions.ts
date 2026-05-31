import { useMemo } from "react";
import {
  createWorkbenchExecutionStateActions,
  type WorkbenchExecutionStateActions,
} from "./workbench-execution-action-registry";
import type { UseWorkbenchStateActionRegistriesInput } from "./workbench-state-action-registry-types";

export function useWorkbenchExecutionStateActions(
  input: UseWorkbenchStateActionRegistriesInput,
): WorkbenchExecutionStateActions {
  return useMemo(
    () =>
      createWorkbenchExecutionStateActions({
        activeQueryRequestIdRef: input.activeQueryRequestIdRef,
        activeExportRequestIdRef: input.activeExportRequestIdRef,
        setResultTab: input.setResultTab,
        setResults: input.setResults,
        setQueryError: input.setQueryError,
        setActiveBatchIndex: input.setActiveBatchIndex,
        setPendingEditCells: input.setPendingEditCells,
        setPendingDeleteRows: input.setPendingDeleteRows,
        setPendingInsertedRows: input.setPendingInsertedRows,
        setPreparedGridPlan: input.setPreparedGridPlan,
        clearShownWindowCapNotices: input.clearShownWindowCapNotices,
        setCurrentExportRequestId: input.setCurrentExportRequestId,
        setIsExporting: input.setIsExporting,
        setCurrentRequestId: input.setCurrentRequestId,
        setIsExecuting: input.setIsExecuting,
        setLastGridEditSource: input.setLastGridEditSource,
        showNotification: input.showNotification,
        setRecentQueries: input.setRecentQueries,
        setQueryHistory: input.setQueryHistory,
        setSqlMemory: input.setSqlMemory,
        setPendingSql: input.setPendingSql,
        setPendingCursorOffset: input.setPendingCursorOffset,
        setPendingQuerySource: input.setPendingQuerySource,
        setPendingQueryMode: input.setPendingQueryMode,
        setDangerPreview: input.setDangerPreview,
        setShowDangerDialog: input.setShowDangerDialog,
        setPendingParameterReview: input.setPendingParameterReview,
        setParameterValues: input.setParameterValues,
        setPendingScriptReview: input.setPendingScriptReview,
        setIsExplaining: input.setIsExplaining,
      }),
    [input],
  );
}
