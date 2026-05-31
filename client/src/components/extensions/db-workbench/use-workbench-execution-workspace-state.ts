import { useState } from "react";
import type {
  DangerousSqlPreview,
  DbExplainPlan,
  DbGridEditSource,
  QueryExecutionResponse,
} from "@shared/schema";
import type {
  QueryRunMode,
  WorkbenchResultTab,
} from "./workbench-session";
import type { SqlParameterInputValue } from "./sql-parameters";
import type {
  PendingSqlParameterReview,
  PendingSqlScriptReview,
} from "./query-execution-gates";

export function useWorkbenchExecutionWorkspaceState(
  initialResultTab: WorkbenchResultTab,
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [results, setResults] = useState<QueryExecutionResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [explainPlan, setExplainPlan] = useState<DbExplainPlan | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const [dangerPreview, setDangerPreview] =
    useState<DangerousSqlPreview | null>(null);
  const [showDangerDialog, setShowDangerDialog] = useState(false);
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const [pendingCursorOffset, setPendingCursorOffset] =
    useState<number | undefined>(undefined);
  const [pendingQuerySource, setPendingQuerySource] =
    useState<DbGridEditSource | null>(null);
  const [pendingQueryMode, setPendingQueryMode] =
    useState<QueryRunMode>("statement");
  const [pendingParameterReview, setPendingParameterReview] =
    useState<PendingSqlParameterReview | null>(null);
  const [parameterValues, setParameterValues] =
    useState<Record<string, SqlParameterInputValue>>({});
  const [pendingScriptReview, setPendingScriptReview] =
    useState<PendingSqlScriptReview | null>(null);

  const [stopOnError, setStopOnError] = useState(true);
  const [resultTab, setResultTab] =
    useState<WorkbenchResultTab>(initialResultTab);

  return {
    currentRequestId,
    dangerPreview,
    explainError,
    explainPlan,
    isExecuting,
    isExplaining,
    parameterValues,
    pendingCursorOffset,
    pendingParameterReview,
    pendingQueryMode,
    pendingQuerySource,
    pendingScriptReview,
    pendingSql,
    queryError,
    resultTab,
    results,
    setCurrentRequestId,
    setDangerPreview,
    setExplainError,
    setExplainPlan,
    setIsExecuting,
    setIsExplaining,
    setParameterValues,
    setPendingCursorOffset,
    setPendingParameterReview,
    setPendingQueryMode,
    setPendingQuerySource,
    setPendingScriptReview,
    setPendingSql,
    setQueryError,
    setResultTab,
    setResults,
    setShowDangerDialog,
    setStopOnError,
    showDangerDialog,
    stopOnError,
  };
}
