import type {
  DbExplainPlan,
  ExplainRequest,
} from "@shared/schema";
import {
  resolveWorkbenchCancellationTargets,
} from "./request-lifecycle-runtime";
import type { WorkbenchResultTab } from "./workbench-session";
import { formatWorkbenchError } from "./workbench-errors";

export type RequestLifecycleNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export interface RunExplainQueryInput {
  connectionId: string;
  sql: string;
  runtimeSchema?: string;
  isExplaining: boolean;
  explainQuery: (request: ExplainRequest) => Promise<DbExplainPlan>;
  beginExplain: () => void;
  setExplainError: (message: string | null) => void;
  setExplainPlan: (plan: DbExplainPlan | null) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  showNotification: (notice: RequestLifecycleNotice) => void;
  finishExplain: () => void;
}

export interface RequestLifecycleStateActions {
  beginExplain: () => void;
  finishExplain: () => void;
  clearQueryRequest: () => void;
  clearExportRequest: () => void;
  startCancelRequest: (requestId: string) => void;
  finishCancelRequest: (requestId: string) => void;
}

export function createRequestLifecycleStateActions(input: {
  setIsExplaining: (isExplaining: boolean) => void;
  setActiveQueryRequestId: (requestId: string | null) => void;
  getActiveQueryRequestId: () => string | null;
  setCurrentRequestId: (requestId: string | null) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setActiveExportRequestId: (requestId: string | null) => void;
  setCurrentExportRequestId: (requestId: string | null) => void;
  setIsExporting: (isExporting: boolean) => void;
}): RequestLifecycleStateActions {
  return {
    beginExplain: () => input.setIsExplaining(true),
    finishExplain: () => input.setIsExplaining(false),
    clearQueryRequest: () => {
      input.setActiveQueryRequestId(null);
      input.setIsExecuting(false);
      input.setCurrentRequestId(null);
    },
    clearExportRequest: () => {
      input.setActiveExportRequestId(null);
      input.setIsExporting(false);
      input.setCurrentExportRequestId(null);
    },
    startCancelRequest: (requestId) => {
      input.setActiveQueryRequestId(requestId);
      input.setCurrentRequestId(requestId);
      input.setIsExecuting(true);
    },
    finishCancelRequest: (requestId) => {
      if (input.getActiveQueryRequestId() === requestId) {
        input.setActiveQueryRequestId(null);
      }
      input.setIsExecuting(false);
      input.setCurrentRequestId(null);
    },
  };
}

export async function runExplainQuery(
  input: RunExplainQueryInput,
): Promise<DbExplainPlan | null> {
  if (!input.sql.trim() || input.isExplaining) return null;

  input.beginExplain();
  input.setExplainError(null);

  try {
    const plan = await input.explainQuery({
      connectionId: input.connectionId,
      sql: input.sql,
      schema: input.runtimeSchema,
    });
    input.setExplainPlan(plan);
    input.setResultTab("explain");
    return plan;
  } catch (error) {
    const message = formatWorkbenchError(
      error,
      "Unable to get execution plan from the current connection.",
    );
    input.setExplainPlan(null);
    input.setExplainError(message);
    input.setResultTab("explain");
    input.showNotification({
      title: "Explain 执行失败",
      description: message,
      variant: "destructive",
    });
    return null;
  } finally {
    input.finishExplain();
  }
}

export interface RunWorkbenchCancellationInput {
  queryRequestId: string | null;
  exportRequestId: string | null;
  clearQueryRequest: () => void;
  clearExportRequest: () => void;
  cancelQuery: (requestId: string) => Promise<unknown>;
}

export async function runWorkbenchCancellation(
  input: RunWorkbenchCancellationInput,
): Promise<string | null> {
  const { queryRequestId, exportRequestId } = resolveWorkbenchCancellationTargets({
    queryRequestId: input.queryRequestId,
    exportRequestId: input.exportRequestId,
  });
  const requestId = queryRequestId ?? exportRequestId;
  if (!requestId) return null;

  if (requestId === queryRequestId) {
    input.clearQueryRequest();
  }
  if (requestId === exportRequestId) {
    input.clearExportRequest();
  }

  try {
    await input.cancelQuery(requestId);
  } catch {
    // Ignore cancellation transport failures after the UI has already moved on.
  }

  return requestId;
}
