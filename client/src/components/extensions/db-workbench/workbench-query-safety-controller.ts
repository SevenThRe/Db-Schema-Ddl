import type { Dispatch, SetStateAction } from "react";
import type { DbGridEditSource } from "@shared/schema";
import type { PendingSqlParameterReview, PendingSqlScriptReview } from "./query-execution-gates";
import {
  shouldSkipQueryExecution,
} from "./query-execution-gates";
import {
  runCancelDangerousSql,
  runCancelParameterReview,
  runCancelScriptReview,
  runConfirmDangerousSql,
  runConfirmParameterReview,
  runConfirmScriptReview,
  runExecuteScriptWithReview,
  runExecuteWithParameterGate,
  runParameterValueChange,
  type QuerySafetyStateActions,
} from "./query-safety-runner";
import type { SqlParameterInputValue } from "./sql-parameters";
import type { QueryRunMode } from "./workbench-session";

export interface WorkbenchQuerySafetyController {
  handleParameterValueChange: (name: string, rawValue: string) => void;
  handleCancelParameterReview: () => void;
  handleConfirmParameterReview: () => Promise<void>;
  handleExecute: (
    sql: string,
    source?: DbGridEditSource | null,
    mode?: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<void>;
  handleDangerConfirm: () => Promise<void>;
  handleDangerCancel: () => void;
  handleCancelScriptReview: () => void;
  handleConfirmScriptReview: () => Promise<void>;
  handleExecuteSelection: (sql: string, cursorOffset?: number) => Promise<void>;
  handleExecuteScript: (sql: string) => Promise<void>;
}

export function createWorkbenchQuerySafetyController(input: {
  isExecuting: boolean;
  isExporting: boolean;
  pendingSql: string | null;
  pendingCursorOffset?: number;
  pendingQuerySource: DbGridEditSource | null;
  pendingQueryMode: QueryRunMode;
  pendingParameterReview: PendingSqlParameterReview | null;
  parameterValues: Record<string, SqlParameterInputValue>;
  pendingScriptReview: PendingSqlScriptReview | null;
  actions: QuerySafetyStateActions;
  setParameterValues: Dispatch<SetStateAction<Record<string, SqlParameterInputValue>>>;
  previewAndExecuteSql: (
    sql: string,
    source?: DbGridEditSource | null,
    mode?: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<unknown>;
  executeImmediate: (
    sql: string,
    confirmed: boolean,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<unknown>;
}): WorkbenchQuerySafetyController {
  const handleExecute = async (
    sql: string,
    source: DbGridEditSource | null = null,
    mode: QueryRunMode = "statement",
    cursorOffset?: number,
  ) => {
    await runExecuteWithParameterGate({
      sql,
      source,
      mode,
      cursorOffset,
      isExecuting: input.isExecuting,
      isExporting: input.isExporting,
      applyParameterReview: input.actions.applyParameterReview,
      applyParameterValues: input.actions.applyParameterValues,
      previewAndExecuteSql: input.previewAndExecuteSql,
    });
  };

  const executeScript = async (sql: string) => {
    await handleExecute(sql, null, "script", undefined);
  };

  return {
    handleParameterValueChange: (name, rawValue) => {
      runParameterValueChange({
        name,
        rawValue,
        setParameterValues: input.setParameterValues,
      });
    },
    handleCancelParameterReview: () => {
      runCancelParameterReview({
        clearReview: input.actions.clearParameterReview,
        clearParameterValues: input.actions.clearParameterValues,
      });
    },
    handleConfirmParameterReview: async () => {
      await runConfirmParameterReview({
        review: input.pendingParameterReview,
        parameterValues: input.parameterValues,
        clearReview: input.actions.clearParameterReview,
        clearParameterValues: input.actions.clearParameterValues,
        previewAndExecuteSql: input.previewAndExecuteSql,
      });
    },
    handleExecute,
    handleDangerConfirm: async () => {
      await runConfirmDangerousSql({
        review: {
          sql: input.pendingSql,
          source: input.pendingQuerySource,
          mode: input.pendingQueryMode,
          cursorOffset: input.pendingCursorOffset,
        },
        executeImmediate: input.executeImmediate,
        setShowDangerDialog: input.actions.setShowDangerDialog,
        clearDangerPreview: input.actions.clearDangerPreview,
        setPendingSql: input.actions.setPendingSql,
        setPendingCursorOffset: input.actions.setPendingCursorOffset,
        setPendingQuerySource: input.actions.setPendingQuerySource,
        setPendingQueryMode: input.actions.setPendingQueryMode,
      });
    },
    handleDangerCancel: () => {
      runCancelDangerousSql({
        setShowDangerDialog: input.actions.setShowDangerDialog,
        clearDangerPreview: input.actions.clearDangerPreview,
        setPendingSql: input.actions.setPendingSql,
        setPendingCursorOffset: input.actions.setPendingCursorOffset,
        setPendingQuerySource: input.actions.setPendingQuerySource,
        setPendingQueryMode: input.actions.setPendingQueryMode,
      });
    },
    handleCancelScriptReview: () => {
      runCancelScriptReview({
        clearScriptReview: input.actions.clearScriptReview,
      });
    },
    handleConfirmScriptReview: async () => {
      await runConfirmScriptReview({
        review: input.pendingScriptReview,
        clearScriptReview: input.actions.clearScriptReview,
        executeScript,
      });
    },
    handleExecuteSelection: async (sql, cursorOffset) => {
      if (shouldSkipQueryExecution({ sql, isExecuting: input.isExecuting })) return;
      await handleExecute(sql, null, "statement", cursorOffset);
    },
    handleExecuteScript: async (sql) => {
      await runExecuteScriptWithReview({
        sql,
        isExecuting: input.isExecuting,
        applyScriptReview: input.actions.applyScriptReview,
        executeScript,
      });
    },
  };
}
