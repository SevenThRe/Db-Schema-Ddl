import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { HostApi } from "@/extensions/host-api";
import type {
  DbConnectionConfig,
  DbExplainPlan,
  DbGridEditSource,
  DbTableSchema,
} from "@shared/schema";
import type { SqlParameterInputValue } from "./sql-parameters";
import type {
  PendingSqlParameterReview,
  PendingSqlScriptReview,
} from "./query-execution-gates";
import type { QueryRunMode } from "./workbench-session";
import type { QueryExecutionStateActions } from "./query-execution-runner";
import type { QuerySafetyStateActions } from "./query-safety-runner";
import type { RequestLifecycleStateActions } from "./request-lifecycle-runner";
import type { ResultWorkspaceStateActions } from "./result-workspace-runner";
import {
  createWorkbenchQueryExecutionController,
} from "./workbench-query-execution-controller";
import {
  createWorkbenchQuerySafetyController,
} from "./workbench-query-safety-controller";
import {
  createWorkbenchRequestLifecycleController,
} from "./workbench-request-lifecycle-controller";

export interface WorkbenchQueryControllers {
  executeImmediate: ReturnType<
    typeof createWorkbenchQueryExecutionController
  >["executeImmediate"];
  previewAndExecuteSql: ReturnType<
    typeof createWorkbenchQueryExecutionController
  >["previewAndExecuteSql"];
  handleCancelParameterReview: () => void;
  handleCancelScriptReview: () => void;
  handleConfirmParameterReview: () => Promise<void>;
  handleConfirmScriptReview: () => Promise<void>;
  handleDangerCancel: () => void;
  handleDangerConfirm: () => Promise<void>;
  handleExecute: (
    sql: string,
    source?: DbGridEditSource | null,
    mode?: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<void>;
  handleExecuteScript: (sql: string) => Promise<void>;
  handleExecuteSelection: (sql: string, cursorOffset?: number) => Promise<void>;
  handleParameterValueChange: (name: string, rawValue: string) => void;
  handleCancel: () => Promise<void>;
  handleExplain: (sql: string) => Promise<void>;
}

export interface UseWorkbenchQueryControllersInput {
  activeQueryRequestIdRef: MutableRefObject<string | null>;
  connection: DbConnectionConfig;
  currentExportRequestId: string | null;
  currentRequestId: string | null;
  hostApi: HostApi;
  isExecuting: boolean;
  isExporting: boolean;
  isExplaining: boolean;
  parameterValues: Record<string, SqlParameterInputValue>;
  pendingCursorOffset?: number;
  pendingParameterReview: PendingSqlParameterReview | null;
  pendingQueryMode: QueryRunMode;
  pendingQuerySource: DbGridEditSource | null;
  pendingScriptReview: PendingSqlScriptReview | null;
  pendingSql: string | null;
  queryExecutionStateActions: QueryExecutionStateActions;
  querySafetyStateActions: QuerySafetyStateActions;
  requestLifecycleStateActions: RequestLifecycleStateActions;
  resultWorkspaceStateActions: ResultWorkspaceStateActions;
  runtimeSchema?: string;
  schemaTables?: DbTableSchema[];
  setExplainError: (message: string | null) => void;
  setExplainPlan: (plan: DbExplainPlan | null) => void;
  setParameterValues: Dispatch<SetStateAction<Record<string, SqlParameterInputValue>>>;
  stopOnError: boolean;
}

export function useWorkbenchQueryControllers(
  input: UseWorkbenchQueryControllersInput,
): WorkbenchQueryControllers {
  const queryExecutionController = useMemo(
    () =>
      createWorkbenchQueryExecutionController({
        connectionId: input.connection.id,
        readonlyConnection: input.connection.readonly === true,
        runtimeSchema: input.runtimeSchema,
        schemaTables: input.schemaTables,
        stopOnError: input.stopOnError,
        isExecuting: input.isExecuting,
        isExporting: input.isExporting,
        createRequestId: () => crypto.randomUUID(),
        getActiveQueryRequestId: () => input.activeQueryRequestIdRef.current,
        queryExecutionActions: input.queryExecutionStateActions,
        querySafetyActions: input.querySafetyStateActions,
        executeQuery: input.hostApi.connections.executeQuery,
        previewDangerousSql: (sqlToPreview, previewCursorOffset) =>
          input.hostApi.connections.previewDangerousSql(
            input.connection.id,
            sqlToPreview,
            previewCursorOffset,
          ),
      }),
    [
      input.activeQueryRequestIdRef,
      input.connection.id,
      input.connection.readonly,
      input.hostApi.connections,
      input.isExecuting,
      input.isExporting,
      input.queryExecutionStateActions,
      input.querySafetyStateActions,
      input.runtimeSchema,
      input.schemaTables,
      input.stopOnError,
    ],
  );
  const { executeImmediate, previewAndExecuteSql } = queryExecutionController;

  const querySafetyController = useMemo(
    () =>
      createWorkbenchQuerySafetyController({
        isExecuting: input.isExecuting,
        isExporting: input.isExporting,
        pendingSql: input.pendingSql,
        pendingCursorOffset: input.pendingCursorOffset,
        pendingQuerySource: input.pendingQuerySource,
        pendingQueryMode: input.pendingQueryMode,
        pendingParameterReview: input.pendingParameterReview,
        parameterValues: input.parameterValues,
        pendingScriptReview: input.pendingScriptReview,
        actions: input.querySafetyStateActions,
        setParameterValues: input.setParameterValues,
        previewAndExecuteSql,
        executeImmediate,
      }),
    [
      executeImmediate,
      input.isExecuting,
      input.isExporting,
      input.parameterValues,
      input.pendingCursorOffset,
      input.pendingParameterReview,
      input.pendingQueryMode,
      input.pendingQuerySource,
      input.pendingScriptReview,
      input.pendingSql,
      input.querySafetyStateActions,
      input.setParameterValues,
      previewAndExecuteSql,
    ],
  );

  const requestLifecycleController = useMemo(
    () =>
      createWorkbenchRequestLifecycleController({
        connectionId: input.connection.id,
        runtimeSchema: input.runtimeSchema,
        isExplaining: input.isExplaining,
        currentRequestId: input.currentRequestId,
        currentExportRequestId: input.currentExportRequestId,
        actions: input.requestLifecycleStateActions,
        explainQuery: input.hostApi.connections.explainQuery,
        cancelQuery: input.hostApi.connections.cancelQuery,
        setExplainError: input.setExplainError,
        setExplainPlan: input.setExplainPlan,
        setResultTab: input.resultWorkspaceStateActions.selectResultTab,
        showNotification: input.hostApi.notifications.show,
      }),
    [
      input.connection.id,
      input.currentExportRequestId,
      input.currentRequestId,
      input.hostApi.connections,
      input.hostApi.notifications,
      input.isExplaining,
      input.requestLifecycleStateActions,
      input.resultWorkspaceStateActions,
      input.runtimeSchema,
      input.setExplainError,
      input.setExplainPlan,
    ],
  );

  return {
    executeImmediate,
    previewAndExecuteSql,
    handleCancelParameterReview: querySafetyController.handleCancelParameterReview,
    handleCancelScriptReview: querySafetyController.handleCancelScriptReview,
    handleConfirmParameterReview: querySafetyController.handleConfirmParameterReview,
    handleConfirmScriptReview: querySafetyController.handleConfirmScriptReview,
    handleDangerCancel: querySafetyController.handleDangerCancel,
    handleDangerConfirm: querySafetyController.handleDangerConfirm,
    handleExecute: querySafetyController.handleExecute,
    handleExecuteScript: querySafetyController.handleExecuteScript,
    handleExecuteSelection: querySafetyController.handleExecuteSelection,
    handleParameterValueChange: querySafetyController.handleParameterValueChange,
    handleCancel: requestLifecycleController.handleCancel,
    handleExplain: requestLifecycleController.handleExplain,
  };
}
