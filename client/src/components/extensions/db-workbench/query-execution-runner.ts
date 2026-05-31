import type {
  DbGridEditSource,
  QueryExecutionResponse,
} from "@shared/schema";
import type { ToastOptions } from "@/extensions/host-api";
import type { QueryRunMode } from "./workbench-session";
import {
  buildQueryExecutionRequest,
  recordFailedQueryExecution,
  recordSuccessfulQueryExecution,
} from "./query-execution-runtime";
import {
  shouldFinalizeWorkbenchRequest,
  shouldIgnoreWorkbenchResponse,
} from "./request-lifecycle-runtime";
import {
  formatWorkbenchError,
  isCancelledQueryMessage,
} from "./workbench-errors";
import type { QueryExecutionSessionUpdate } from "./query-execution-state-actions";

export {
  createQueryExecutionStateActions,
  runApplyQueryExecutionFailureState,
  runApplyQueryExecutionSuccessState,
  runFinishQueryExecutionRequestState,
  runStartQueryExecutionRequestState,
  type QueryExecutionSessionUpdate,
  type QueryExecutionStateActions,
} from "./query-execution-state-actions";

export interface RunWorkbenchQueryExecutionInput {
  connectionId: string;
  sql: string;
  confirmed: boolean;
  source: DbGridEditSource | null;
  mode: QueryRunMode;
  cursorOffset?: number;
  runtimeSchema?: string | null;
  stopOnError: boolean;
  createRequestId: () => string;
  getActiveRequestId: () => string | null;
  startRequest: (requestId: string) => void;
  executeQuery: (request: ReturnType<typeof buildQueryExecutionRequest>) => Promise<QueryExecutionResponse>;
  decorateResults: (
    response: QueryExecutionResponse,
    source: DbGridEditSource | null,
  ) => QueryExecutionResponse;
  applySuccess: (input: {
    response: QueryExecutionResponse;
    decoratedResponse: QueryExecutionResponse;
    source: DbGridEditSource | null;
    session: QueryExecutionSessionUpdate;
  }) => void;
  applyFailure: (input: {
    message: string;
    notice: ToastOptions;
    session: QueryExecutionSessionUpdate | null;
  }) => void;
  finishRequest: (requestId: string) => void;
}

export function buildQueryExecutionFailureNotice(message: string): ToastOptions {
  return {
    title: "查询执行失败",
    description: message,
    variant: "destructive",
  };
}

export async function runWorkbenchQueryExecution(
  input: RunWorkbenchQueryExecutionInput,
): Promise<QueryExecutionResponse | null> {
  const requestId = input.createRequestId();
  input.startRequest(requestId);

  try {
    const response = await input.executeQuery(buildQueryExecutionRequest({
      connectionId: input.connectionId,
      sql: input.sql,
      requestId,
      cursorOffset: input.cursorOffset,
      runtimeSchema: input.runtimeSchema,
      stopOnError: input.stopOnError,
      confirmed: input.confirmed,
    }));
    if (shouldIgnoreWorkbenchResponse({
      activeRequestId: input.getActiveRequestId(),
      requestId,
    })) {
      return null;
    }

    const decoratedResponse = input.decorateResults(response, input.source);
    const session = recordSuccessfulQueryExecution({
      connectionId: input.connectionId,
      sql: input.sql,
      mode: input.mode,
      response,
      runtimeSchema: input.runtimeSchema,
      source: input.source,
    });
    input.applySuccess({
      response,
      decoratedResponse,
      source: input.source,
      session,
    });
    return response;
  } catch (error) {
    if (shouldIgnoreWorkbenchResponse({
      activeRequestId: input.getActiveRequestId(),
      requestId,
    })) {
      return null;
    }

    const message = formatWorkbenchError(
      error,
      "Unable to execute query on the current connection.",
    );
    const session = isCancelledQueryMessage(message)
      ? null
      : recordFailedQueryExecution({
          connectionId: input.connectionId,
          sql: input.sql,
          mode: input.mode,
          errorMessage: message,
        });
    input.applyFailure({
      message,
      notice: buildQueryExecutionFailureNotice(message),
      session,
    });
    return null;
  } finally {
    if (shouldFinalizeWorkbenchRequest({
      activeRequestId: input.getActiveRequestId(),
      requestId,
    })) {
      input.finishRequest(requestId);
    }
  }
}
