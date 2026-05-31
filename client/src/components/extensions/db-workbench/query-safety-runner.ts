import type { DangerousSqlPreview, DbGridEditSource } from "@shared/schema";
import type { QueryRunMode } from "./workbench-session";
import {
  buildInitialSqlParameterValues,
  buildPendingSqlParameterReview,
  buildPendingSqlScriptReview,
  shouldSkipQueryExecution,
  type PendingSqlParameterReview,
  type PendingSqlScriptReview,
} from "./query-execution-gates";
import {
  renderSqlParameters,
  type SqlParameterInputValue,
} from "./sql-parameters";
import type {
  DangerousSqlReviewResetters,
  PendingDangerousSqlReview,
} from "./query-safety-state-actions";

export {
  createQuerySafetyStateActions,
  type DangerousSqlReviewResetters,
  type PendingDangerousSqlReview,
  type QuerySafetyStateActions,
} from "./query-safety-state-actions";

export interface RunConfirmParameterReviewInput {
  review: PendingSqlParameterReview | null;
  parameterValues: Record<string, SqlParameterInputValue>;
  clearReview: () => void;
  clearParameterValues: () => void;
  previewAndExecuteSql: (
    sql: string,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<unknown>;
}

export async function runConfirmParameterReview(
  input: RunConfirmParameterReviewInput,
): Promise<boolean> {
  if (!input.review) return false;

  const rendered = renderSqlParameters(
    input.review.sql,
    input.parameterValues,
    input.review.cursorOffset,
  );

  input.clearReview();
  input.clearParameterValues();
  await input.previewAndExecuteSql(
    rendered.sql,
    input.review.source,
    input.review.mode,
    rendered.cursorOffset,
  );
  return true;
}

export function runParameterValueChange(input: {
  name: string;
  rawValue: string;
  setParameterValues: (
    updater: (
      current: Record<string, SqlParameterInputValue>,
    ) => Record<string, SqlParameterInputValue>,
  ) => void;
}): void {
  input.setParameterValues((current) => ({
    ...current,
    [input.name]: { rawValue: input.rawValue },
  }));
}

export function runCancelParameterReview(input: {
  clearReview: () => void;
  clearParameterValues: () => void;
}): void {
  input.clearReview();
  input.clearParameterValues();
}

export interface RunPreviewAndExecuteSqlInput {
  sql: string;
  source: DbGridEditSource | null;
  mode: QueryRunMode;
  cursorOffset?: number;
  isExecuting: boolean;
  isExporting?: boolean;
  setPendingSql: (sql: string | null) => void;
  setPendingCursorOffset: (cursorOffset: number | undefined) => void;
  setPendingQuerySource: (source: DbGridEditSource | null) => void;
  setPendingQueryMode: (mode: QueryRunMode) => void;
  clearQueryError: () => void;
  setDangerPreview: (preview: DangerousSqlPreview) => void;
  setShowDangerDialog: (open: boolean) => void;
  previewDangerousSql: (
    sql: string,
    cursorOffset?: number,
  ) => Promise<DangerousSqlPreview>;
  executeImmediate: (
    sql: string,
    confirmed: boolean,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<unknown>;
}

export type PreviewAndExecuteSqlResult =
  | "skipped"
  | "danger-review"
  | "executed"
  | "fallback-executed";

function clearPendingSqlReview(input: {
  setPendingSql: (sql: string | null) => void;
  setPendingCursorOffset: (cursorOffset: number | undefined) => void;
  setPendingQuerySource: (source: DbGridEditSource | null) => void;
  setPendingQueryMode: (mode: QueryRunMode) => void;
}): void {
  input.setPendingSql(null);
  input.setPendingCursorOffset(undefined);
  input.setPendingQuerySource(null);
  input.setPendingQueryMode("statement");
}

export async function runPreviewAndExecuteSql(
  input: RunPreviewAndExecuteSqlInput,
): Promise<PreviewAndExecuteSqlResult> {
  if (
    shouldSkipQueryExecution({
      sql: input.sql,
      isExecuting: input.isExecuting,
      isExporting: input.isExporting,
    })
  ) {
    return "skipped";
  }

  input.setPendingSql(input.sql);
  input.setPendingCursorOffset(input.cursorOffset);
  input.setPendingQuerySource(input.source);
  input.setPendingQueryMode(input.mode);
  input.clearQueryError();

  try {
    const preview = await input.previewDangerousSql(input.sql, input.cursorOffset);

    if (preview.dangers.length > 0) {
      input.setDangerPreview(preview);
      input.setShowDangerDialog(true);
      return "danger-review";
    }

    await input.executeImmediate(
      input.sql,
      false,
      input.source,
      input.mode,
      input.cursorOffset,
    );
    clearPendingSqlReview(input);
    return "executed";
  } catch {
    await input.executeImmediate(
      input.sql,
      false,
      input.source,
      input.mode,
      input.cursorOffset,
    );
    clearPendingSqlReview(input);
    return "fallback-executed";
  }
}

export interface RunExecuteWithParameterGateInput {
  sql: string;
  source: DbGridEditSource | null;
  mode: QueryRunMode;
  cursorOffset?: number;
  isExecuting: boolean;
  isExporting?: boolean;
  applyParameterReview: (review: PendingSqlParameterReview) => void;
  applyParameterValues: (
    values: Record<string, SqlParameterInputValue>,
  ) => void;
  previewAndExecuteSql: (
    sql: string,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<unknown>;
}

export type ExecuteWithParameterGateResult =
  | "skipped"
  | "parameter-review"
  | "executed";

export async function runExecuteWithParameterGate(
  input: RunExecuteWithParameterGateInput,
): Promise<ExecuteWithParameterGateResult> {
  if (
    shouldSkipQueryExecution({
      sql: input.sql,
      isExecuting: input.isExecuting,
      isExporting: input.isExporting,
    })
  ) {
    return "skipped";
  }

  const parameterReview = buildPendingSqlParameterReview({
    sql: input.sql,
    source: input.source,
    cursorOffset: input.cursorOffset,
    mode: input.mode,
  });
  if (parameterReview) {
    input.applyParameterReview(parameterReview);
    input.applyParameterValues(
      buildInitialSqlParameterValues(parameterReview.parameters),
    );
    return "parameter-review";
  }

  await input.previewAndExecuteSql(
    input.sql,
    input.source,
    input.mode,
    input.cursorOffset,
  );
  return "executed";
}

function clearDangerousSqlReview(resetters: DangerousSqlReviewResetters): void {
  resetters.setShowDangerDialog(false);
  resetters.clearDangerPreview();
  clearPendingSqlReview(resetters);
}

export interface RunConfirmDangerousSqlInput extends DangerousSqlReviewResetters {
  review: PendingDangerousSqlReview;
  executeImmediate: (
    sql: string,
    confirmed: boolean,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<unknown>;
}

export async function runConfirmDangerousSql(
  input: RunConfirmDangerousSqlInput,
): Promise<boolean> {
  input.setShowDangerDialog(false);
  input.clearDangerPreview();

  if (!input.review.sql) {
    clearDangerousSqlReview(input);
    return false;
  }

  await input.executeImmediate(
    input.review.sql,
    true,
    input.review.source,
    input.review.mode,
    input.review.cursorOffset,
  );
  clearPendingSqlReview(input);
  return true;
}

export function runCancelDangerousSql(
  input: DangerousSqlReviewResetters,
): void {
  clearDangerousSqlReview(input);
}

export interface RunExecuteScriptWithReviewInput {
  sql: string;
  isExecuting: boolean;
  applyScriptReview: (review: PendingSqlScriptReview) => void;
  executeScript: (sql: string) => Promise<unknown>;
}

export type ExecuteScriptWithReviewResult =
  | "skipped"
  | "script-review"
  | "executed";

export async function runExecuteScriptWithReview(
  input: RunExecuteScriptWithReviewInput,
): Promise<ExecuteScriptWithReviewResult> {
  if (shouldSkipQueryExecution({ sql: input.sql, isExecuting: input.isExecuting })) {
    return "skipped";
  }

  const scriptReview = buildPendingSqlScriptReview(input.sql);
  if (scriptReview) {
    input.applyScriptReview(scriptReview);
    return "script-review";
  }

  await input.executeScript(input.sql);
  return "executed";
}

export interface RunConfirmScriptReviewInput {
  review: PendingSqlScriptReview | null;
  clearScriptReview: () => void;
  executeScript: (sql: string) => Promise<unknown>;
}

export async function runConfirmScriptReview(
  input: RunConfirmScriptReviewInput,
): Promise<boolean> {
  if (!input.review) return false;
  const sql = input.review.sql;
  input.clearScriptReview();
  await input.executeScript(sql);
  return true;
}

export function runCancelScriptReview(input: {
  clearScriptReview: () => void;
}): void {
  input.clearScriptReview();
}
