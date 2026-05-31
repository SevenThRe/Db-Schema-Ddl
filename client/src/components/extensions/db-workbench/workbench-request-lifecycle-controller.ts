import type { DbExplainPlan, ExplainRequest } from "@shared/schema";
import {
  runExplainQuery,
  runWorkbenchCancellation,
  type RequestLifecycleNotice,
  type RequestLifecycleStateActions,
} from "./request-lifecycle-runner";
import type { WorkbenchResultTab } from "./workbench-session";

export interface WorkbenchRequestLifecycleController {
  handleExplain: (sql: string) => Promise<void>;
  handleCancel: () => Promise<void>;
}

export function createWorkbenchRequestLifecycleController(input: {
  connectionId: string;
  runtimeSchema?: string;
  isExplaining: boolean;
  currentRequestId: string | null;
  currentExportRequestId: string | null;
  actions: RequestLifecycleStateActions;
  explainQuery: (request: ExplainRequest) => Promise<DbExplainPlan>;
  cancelQuery: (requestId: string) => Promise<unknown>;
  setExplainError: (message: string | null) => void;
  setExplainPlan: (plan: DbExplainPlan | null) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  showNotification: (notice: RequestLifecycleNotice) => void;
}): WorkbenchRequestLifecycleController {
  return {
    handleExplain: async (sql: string) => {
      await runExplainQuery({
        connectionId: input.connectionId,
        sql,
        runtimeSchema: input.runtimeSchema,
        isExplaining: input.isExplaining,
        explainQuery: input.explainQuery,
        beginExplain: input.actions.beginExplain,
        setExplainError: input.setExplainError,
        setExplainPlan: input.setExplainPlan,
        setResultTab: input.setResultTab,
        showNotification: input.showNotification,
        finishExplain: input.actions.finishExplain,
      });
    },
    handleCancel: async () => {
      await runWorkbenchCancellation({
        queryRequestId: input.currentRequestId,
        exportRequestId: input.currentExportRequestId,
        clearQueryRequest: input.actions.clearQueryRequest,
        clearExportRequest: input.actions.clearExportRequest,
        cancelQuery: input.cancelQuery,
      });
    },
  };
}
