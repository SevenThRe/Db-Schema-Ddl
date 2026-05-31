import type {
  DbExplainPlan,
  DbGridEditPatchCell,
  DbGridDeleteRowDraft,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import type { WorkbenchResultTab } from "./workbench-session";

export type QueryWorkspaceResetState = {
  results: QueryExecutionResponse | null;
  explainPlan: DbExplainPlan | null;
  queryError: string | null;
  explainError: string | null;
  activeBatchIndex: number;
  resultTab: WorkbenchResultTab;
  pendingEditCells: Record<string, DbGridEditPatchCell>;
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>;
  pendingInsertedRows: Record<string, DbGridInsertedRowDraft>;
  preparedGridPlan: DbGridPrepareCommitResponse | null;
  lastGridEditSource: DbGridEditSource | null;
};

export function createQueryWorkspaceResetState(): QueryWorkspaceResetState {
  return {
    results: null,
    explainPlan: null,
    queryError: null,
    explainError: null,
    activeBatchIndex: 0,
    resultTab: "results",
    pendingEditCells: {},
    pendingDeleteRows: {},
    pendingInsertedRows: {},
    preparedGridPlan: null,
    lastGridEditSource: null,
  };
}
