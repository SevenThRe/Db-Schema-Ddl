import type { DangerousSqlPreview, DbGridEditSource } from "@shared/schema";
import type { QueryRunMode } from "./workbench-session";
import type {
  PendingSqlParameterReview,
  PendingSqlScriptReview,
} from "./query-execution-gates";
import type { SqlParameterInputValue } from "./sql-parameters";

export interface PendingDangerousSqlReview {
  sql: string | null;
  source: DbGridEditSource | null;
  mode: QueryRunMode;
  cursorOffset?: number;
}

export interface DangerousSqlReviewResetters {
  setShowDangerDialog: (open: boolean) => void;
  clearDangerPreview: () => void;
  setPendingSql: (sql: string | null) => void;
  setPendingCursorOffset: (cursorOffset: number | undefined) => void;
  setPendingQuerySource: (source: DbGridEditSource | null) => void;
  setPendingQueryMode: (mode: QueryRunMode) => void;
}

export interface QuerySafetyStateActions extends DangerousSqlReviewResetters {
  clearQueryError: () => void;
  setDangerPreview: (preview: DangerousSqlPreview) => void;
  applyParameterReview: (review: PendingSqlParameterReview) => void;
  applyParameterValues: (
    values: Record<string, SqlParameterInputValue>,
  ) => void;
  clearParameterReview: () => void;
  clearParameterValues: () => void;
  applyScriptReview: (review: PendingSqlScriptReview) => void;
  clearScriptReview: () => void;
}

export function createQuerySafetyStateActions(input: {
  setPendingSql: (sql: string | null) => void;
  setPendingCursorOffset: (cursorOffset: number | undefined) => void;
  setPendingQuerySource: (source: DbGridEditSource | null) => void;
  setPendingQueryMode: (mode: QueryRunMode) => void;
  setQueryError: (message: string | null) => void;
  setDangerPreview: (preview: DangerousSqlPreview | null) => void;
  setShowDangerDialog: (open: boolean) => void;
  setPendingParameterReview: (review: PendingSqlParameterReview | null) => void;
  setParameterValues: (
    values: Record<string, SqlParameterInputValue>,
  ) => void;
  setPendingScriptReview: (review: PendingSqlScriptReview | null) => void;
}): QuerySafetyStateActions {
  return {
    setPendingSql: input.setPendingSql,
    setPendingCursorOffset: input.setPendingCursorOffset,
    setPendingQuerySource: input.setPendingQuerySource,
    setPendingQueryMode: input.setPendingQueryMode,
    setShowDangerDialog: input.setShowDangerDialog,
    clearDangerPreview: () => input.setDangerPreview(null),
    clearQueryError: () => input.setQueryError(null),
    setDangerPreview: input.setDangerPreview,
    applyParameterReview: input.setPendingParameterReview,
    applyParameterValues: input.setParameterValues,
    clearParameterReview: () => input.setPendingParameterReview(null),
    clearParameterValues: () => input.setParameterValues({}),
    applyScriptReview: input.setPendingScriptReview,
    clearScriptReview: () => input.setPendingScriptReview(null),
  };
}
