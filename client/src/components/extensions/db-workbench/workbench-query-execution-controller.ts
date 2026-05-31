import type {
  DangerousSqlPreview,
  DbGridEditSource,
  DbTableSchema,
  QueryExecutionResponse,
} from "@shared/schema";
import {
  decorateQueryResultsForEdit,
} from "./grid-edit-runtime";
import {
  runWorkbenchQueryExecution,
  type QueryExecutionStateActions,
} from "./query-execution-runner";
import type {
  QueryRunMode,
} from "./workbench-session";
import {
  runPreviewAndExecuteSql,
  type QuerySafetyStateActions,
} from "./query-safety-runner";

export interface WorkbenchQueryExecutionController {
  executeImmediate: (
    sql: string,
    confirmed: boolean,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<QueryExecutionResponse | null>;
  previewAndExecuteSql: (
    sql: string,
    source?: DbGridEditSource | null,
    mode?: QueryRunMode,
    cursorOffset?: number,
  ) => Promise<void>;
}

export function createWorkbenchQueryExecutionController(input: {
  connectionId: string;
  readonlyConnection: boolean;
  runtimeSchema?: string | null;
  schemaTables?: DbTableSchema[];
  stopOnError: boolean;
  isExecuting: boolean;
  isExporting: boolean;
  createRequestId: () => string;
  getActiveQueryRequestId: () => string | null;
  queryExecutionActions: QueryExecutionStateActions;
  querySafetyActions: QuerySafetyStateActions;
  executeQuery: Parameters<typeof runWorkbenchQueryExecution>[0]["executeQuery"];
  previewDangerousSql: (
    sql: string,
    cursorOffset?: number,
  ) => Promise<DangerousSqlPreview>;
}): WorkbenchQueryExecutionController {
  const decorateResultsForEdit = (
    response: QueryExecutionResponse,
    source: DbGridEditSource | null,
  ) =>
    decorateQueryResultsForEdit(response, source, {
      readonlyConnection: input.readonlyConnection,
      runtimeSchema: input.runtimeSchema ?? undefined,
      schemaTables: input.schemaTables,
    });

  const executeImmediate = (
    sql: string,
    confirmed: boolean,
    source: DbGridEditSource | null,
    mode: QueryRunMode,
    cursorOffset?: number,
  ) =>
    runWorkbenchQueryExecution({
      connectionId: input.connectionId,
      sql,
      confirmed,
      source,
      mode,
      cursorOffset,
      runtimeSchema: input.runtimeSchema,
      stopOnError: input.stopOnError,
      createRequestId: input.createRequestId,
      getActiveRequestId: input.getActiveQueryRequestId,
      startRequest: input.queryExecutionActions.startRequest,
      executeQuery: input.executeQuery,
      decorateResults: decorateResultsForEdit,
      applySuccess: input.queryExecutionActions.applySuccess,
      applyFailure: input.queryExecutionActions.applyFailure,
      finishRequest: input.queryExecutionActions.finishRequest,
    });

  return {
    executeImmediate,
    previewAndExecuteSql: async (
      sql,
      source = null,
      mode = "statement",
      cursorOffset,
    ) => {
      await runPreviewAndExecuteSql({
        sql,
        source,
        mode,
        cursorOffset,
        isExecuting: input.isExecuting,
        isExporting: input.isExporting,
        setPendingSql: input.querySafetyActions.setPendingSql,
        setPendingCursorOffset: input.querySafetyActions.setPendingCursorOffset,
        setPendingQuerySource: input.querySafetyActions.setPendingQuerySource,
        setPendingQueryMode: input.querySafetyActions.setPendingQueryMode,
        clearQueryError: input.querySafetyActions.clearQueryError,
        setDangerPreview: input.querySafetyActions.setDangerPreview,
        setShowDangerDialog: input.querySafetyActions.setShowDangerDialog,
        previewDangerousSql: input.previewDangerousSql,
        executeImmediate,
      });
    },
  };
}
