import type { DbGridEditSource } from "@shared/schema";
import type { QueryRunMode } from "./workbench-session";
import {
  detectSqlParameters,
  type SqlParameterDefinition,
  type SqlParameterInputValue,
} from "./sql-parameters";
import {
  splitSqlStatements,
  type SqlStatementSegment,
} from "./sql-statements";

export interface PendingSqlParameterReview {
  sql: string;
  source: DbGridEditSource | null;
  cursorOffset?: number;
  parameters: SqlParameterDefinition[];
  mode: QueryRunMode;
}

export interface PendingSqlScriptReview {
  sql: string;
  statements: SqlStatementSegment[];
}

export function shouldSkipQueryExecution(input: {
  sql: string;
  isExecuting: boolean;
  isExporting?: boolean;
}): boolean {
  return !input.sql.trim() || input.isExecuting || input.isExporting === true;
}

export function buildInitialSqlParameterValues(
  parameters: SqlParameterDefinition[],
): Record<string, SqlParameterInputValue> {
  return Object.fromEntries(
    parameters.map((parameter) => [
      parameter.name,
      { rawValue: "" satisfies SqlParameterInputValue["rawValue"] },
    ]),
  );
}

export function buildPendingSqlParameterReview(input: {
  sql: string;
  source: DbGridEditSource | null;
  cursorOffset?: number;
  mode: QueryRunMode;
}): PendingSqlParameterReview | null {
  const parameters = detectSqlParameters(input.sql);
  if (parameters.length === 0) {
    return null;
  }

  return {
    sql: input.sql,
    source: input.source,
    cursorOffset: input.cursorOffset,
    parameters,
    mode: input.mode,
  };
}

export function buildPendingSqlScriptReview(
  sql: string,
): PendingSqlScriptReview | null {
  const statements = splitSqlStatements(sql);
  if (statements.length <= 1) {
    return null;
  }
  return {
    sql,
    statements,
  };
}

export function countSqlStatementsForHistory(
  sql: string,
  mode: QueryRunMode,
): number {
  return mode === "script" ? Math.max(1, splitSqlStatements(sql).length) : 1;
}
