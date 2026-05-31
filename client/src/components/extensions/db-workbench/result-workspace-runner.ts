import type { Dispatch, SetStateAction } from "react";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import type { WorkbenchResultTab } from "./workbench-session";

export interface ResultWorkspaceStateActions {
  selectResultTab: (tab: WorkbenchResultTab) => void;
  selectResultsTab: () => void;
  setActiveBatchIndex: (index: number) => void;
  resetActiveBatchIndex: () => void;
  clearResults: () => void;
  clearQueryError: () => void;
  clearGridDrafts: () => void;
  clearResultWindowCapNotices: () => void;
}

export function createResultWorkspaceStateActions(input: {
  setResultTab: (tab: WorkbenchResultTab) => void;
  setResults: (results: QueryExecutionResponse | null) => void;
  setQueryError: (message: string | null) => void;
  setActiveBatchIndex: (index: number) => void;
  setPendingEditCells: Dispatch<SetStateAction<Record<string, DbGridEditPatchCell>>>;
  setPendingDeleteRows: Dispatch<SetStateAction<Record<string, DbGridDeleteRowDraft>>>;
  setPendingInsertedRows: Dispatch<SetStateAction<Record<string, DbGridInsertedRowDraft>>>;
  setPreparedGridPlan: Dispatch<SetStateAction<DbGridPrepareCommitResponse | null>>;
  clearShownWindowCapNotices: () => void;
}): ResultWorkspaceStateActions {
  return {
    selectResultTab: input.setResultTab,
    selectResultsTab: () => input.setResultTab("results"),
    setActiveBatchIndex: input.setActiveBatchIndex,
    resetActiveBatchIndex: () => input.setActiveBatchIndex(0),
    clearResults: () => input.setResults(null),
    clearQueryError: () => input.setQueryError(null),
    clearGridDrafts: () => {
      input.setPendingEditCells({});
      input.setPendingDeleteRows({});
      input.setPendingInsertedRows({});
      input.setPreparedGridPlan(null);
    },
    clearResultWindowCapNotices: input.clearShownWindowCapNotices,
  };
}

export function resolveActiveBatchIndex(input: {
  results: QueryExecutionResponse | null;
  activeBatchIndex: number;
}): number {
  if (!input.results) return 0;
  if (input.activeBatchIndex < input.results.batches.length) {
    return input.activeBatchIndex;
  }
  return Math.max(0, input.results.batches.length - 1);
}

export function runRepairActiveBatchIndex(input: {
  results: QueryExecutionResponse | null;
  activeBatchIndex: number;
  setActiveBatchIndex: (index: number) => void;
}): boolean {
  const nextIndex = resolveActiveBatchIndex({
    results: input.results,
    activeBatchIndex: input.activeBatchIndex,
  });
  if (nextIndex === input.activeBatchIndex) return false;

  input.setActiveBatchIndex(nextIndex);
  return true;
}

export function runClearGridDraftsForResultContext(input: {
  clearGridDrafts: () => void;
}): void {
  input.clearGridDrafts();
}

export function runClearResultWindowCapNotices(input: {
  clearResultWindowCapNotices: () => void;
}): void {
  input.clearResultWindowCapNotices();
}

export function getActiveBatch(input: {
  results: QueryExecutionResponse | null;
  activeBatchIndex: number;
}): QueryExecutionResponse["batches"][number] | undefined {
  if (!input.results) return undefined;
  return input.results.batches[
    Math.min(input.activeBatchIndex, Math.max(0, input.results.batches.length - 1))
  ];
}
