import type {
  DbGridEditSource,
  QueryExecutionResponse,
} from "@shared/schema";
import type { ToastOptions } from "@/extensions/host-api";
import type { WorkbenchSessionState } from "./workbench-session";

export type QueryExecutionSessionUpdate = Pick<
  WorkbenchSessionState,
  "recentQueries" | "queryHistory" | "sqlMemory"
>;

export function runStartQueryExecutionRequestState(input: {
  requestId: string;
  setActiveRequestId: (requestId: string) => void;
  setCurrentRequestId: (requestId: string) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  clearResults: () => void;
  clearQueryError: () => void;
}): void {
  input.setActiveRequestId(input.requestId);
  input.setCurrentRequestId(input.requestId);
  input.setIsExecuting(true);
  input.clearResults();
  input.clearQueryError();
}

export function runApplyQueryExecutionSuccessState(input: {
  decoratedResponse: QueryExecutionResponse;
  source: DbGridEditSource | null;
  session: QueryExecutionSessionUpdate;
  setResults: (response: QueryExecutionResponse) => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  clearGridDrafts: () => void;
  resetActiveBatchIndex: () => void;
  selectResultsTab: () => void;
  applySession: (session: QueryExecutionSessionUpdate) => void;
}): void {
  input.setResults(input.decoratedResponse);
  input.setLastGridEditSource(input.source);
  input.clearGridDrafts();
  input.resetActiveBatchIndex();
  input.selectResultsTab();
  input.applySession(input.session);
}

export function runApplyQueryExecutionFailureState(input: {
  message: string;
  notice: ToastOptions;
  session: QueryExecutionSessionUpdate | null;
  setQueryError: (message: string) => void;
  selectResultsTab: () => void;
  showNotification: (notice: ToastOptions) => void;
  applySession: (session: QueryExecutionSessionUpdate) => void;
}): void {
  input.setQueryError(input.message);
  input.selectResultsTab();
  input.showNotification(input.notice);
  if (input.session) {
    input.applySession(input.session);
  }
}

export function runFinishQueryExecutionRequestState(input: {
  requestId: string;
  getActiveRequestId: () => string | null;
  clearActiveRequestId: () => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setCurrentRequestId: (requestId: string | null) => void;
}): void {
  if (input.getActiveRequestId() === input.requestId) {
    input.clearActiveRequestId();
  }
  input.setIsExecuting(false);
  input.setCurrentRequestId(null);
}

export interface QueryExecutionStateActions {
  startRequest: (requestId: string) => void;
  applySuccess: (input: {
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

export function createQueryExecutionStateActions(input: {
  setActiveRequestId: (requestId: string) => void;
  getActiveRequestId: () => string | null;
  clearActiveRequestId: () => void;
  setCurrentRequestId: (requestId: string | null) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  clearResults: () => void;
  clearQueryError: () => void;
  setResults: (response: QueryExecutionResponse) => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  clearGridDrafts: () => void;
  resetActiveBatchIndex: () => void;
  selectResultsTab: () => void;
  setQueryError: (message: string) => void;
  showNotification: (notice: ToastOptions) => void;
  setRecentQueries: (recentQueries: QueryExecutionSessionUpdate["recentQueries"]) => void;
  setQueryHistory: (queryHistory: QueryExecutionSessionUpdate["queryHistory"]) => void;
  setSqlMemory: (sqlMemory: QueryExecutionSessionUpdate["sqlMemory"]) => void;
}): QueryExecutionStateActions {
  const applySession = (session: QueryExecutionSessionUpdate) => {
    input.setRecentQueries(session.recentQueries);
    input.setQueryHistory(session.queryHistory);
    input.setSqlMemory(session.sqlMemory);
  };

  return {
    startRequest: (requestId) =>
      runStartQueryExecutionRequestState({
        requestId,
        setActiveRequestId: input.setActiveRequestId,
        setCurrentRequestId: input.setCurrentRequestId,
        setIsExecuting: input.setIsExecuting,
        clearResults: input.clearResults,
        clearQueryError: input.clearQueryError,
      }),
    applySuccess: ({ decoratedResponse, source, session }) =>
      runApplyQueryExecutionSuccessState({
        decoratedResponse,
        source,
        session,
        setResults: input.setResults,
        setLastGridEditSource: input.setLastGridEditSource,
        clearGridDrafts: input.clearGridDrafts,
        resetActiveBatchIndex: input.resetActiveBatchIndex,
        selectResultsTab: input.selectResultsTab,
        applySession,
      }),
    applyFailure: ({ message, notice, session }) =>
      runApplyQueryExecutionFailureState({
        message,
        notice,
        session,
        setQueryError: input.setQueryError,
        selectResultsTab: input.selectResultsTab,
        showNotification: input.showNotification,
        applySession,
      }),
    finishRequest: (requestId) =>
      runFinishQueryExecutionRequestState({
        requestId,
        getActiveRequestId: input.getActiveRequestId,
        clearActiveRequestId: input.clearActiveRequestId,
        setIsExecuting: input.setIsExecuting,
        setCurrentRequestId: input.setCurrentRequestId,
      }),
  };
}
