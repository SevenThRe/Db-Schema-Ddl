import type {
  BinaryCommandResult,
  DbQueryBatchResult,
  ExportRowsRequest,
} from "@shared/schema";
import type { ToastOptions } from "@/extensions/host-api";
import type { ExportFormat, ExportScope } from "./ResultExportMenu";
import {
  buildExportFailureNotice,
  buildExportRowsPayload,
  buildPostExportNotice,
  getPreExportNotice,
  validateExportScope,
} from "./result-export-runtime";
import {
  shouldFinalizeWorkbenchRequest,
  shouldIgnoreWorkbenchResponse,
} from "./request-lifecycle-runtime";
import { formatWorkbenchError } from "./workbench-errors";

export interface RunWorkbenchResultExportInput {
  connectionId: string;
  runtimeSchema?: string | null;
  results: { batches: DbQueryBatchResult[] } | null;
  activeBatchIndex: number;
  scope: ExportScope;
  format: ExportFormat;
  isExecuting: boolean;
  isExporting: boolean;
  createRequestId: () => string;
  getActiveRequestId: () => string | null;
  startRequest: (requestId: string) => void;
  exportRows: (request: ExportRowsRequest) => Promise<BinaryCommandResult>;
  downloadResult: (result: BinaryCommandResult) => void;
  notify: (notice: ToastOptions) => void;
  finishRequest: (requestId: string) => void;
}

export function runStartResultExportRequestState(input: {
  requestId: string;
  setActiveRequestId: (requestId: string) => void;
  setCurrentRequestId: (requestId: string) => void;
  setIsExporting: (isExporting: boolean) => void;
}): void {
  input.setActiveRequestId(input.requestId);
  input.setCurrentRequestId(input.requestId);
  input.setIsExporting(true);
}

export function runFinishResultExportRequestState(input: {
  requestId: string;
  getActiveRequestId: () => string | null;
  clearActiveRequestId: () => void;
  setIsExporting: (isExporting: boolean) => void;
  setCurrentRequestId: (requestId: string | null) => void;
}): void {
  if (input.getActiveRequestId() === input.requestId) {
    input.clearActiveRequestId();
  }
  input.setIsExporting(false);
  input.setCurrentRequestId(null);
}

export interface ResultExportStateActions {
  startRequest: (requestId: string) => void;
  finishRequest: (requestId: string) => void;
}

export function createResultExportStateActions(input: {
  setActiveRequestId: (requestId: string) => void;
  getActiveRequestId: () => string | null;
  clearActiveRequestId: () => void;
  setCurrentRequestId: (requestId: string | null) => void;
  setIsExporting: (isExporting: boolean) => void;
}): ResultExportStateActions {
  return {
    startRequest: (requestId) =>
      runStartResultExportRequestState({
        requestId,
        setActiveRequestId: input.setActiveRequestId,
        setCurrentRequestId: input.setCurrentRequestId,
        setIsExporting: input.setIsExporting,
      }),
    finishRequest: (requestId) =>
      runFinishResultExportRequestState({
        requestId,
        getActiveRequestId: input.getActiveRequestId,
        clearActiveRequestId: input.clearActiveRequestId,
        setIsExporting: input.setIsExporting,
        setCurrentRequestId: input.setCurrentRequestId,
      }),
  };
}

export async function runWorkbenchResultExport(
  input: RunWorkbenchResultExportInput,
): Promise<BinaryCommandResult | null> {
  if (!input.results || input.isExecuting || input.isExporting) {
    return null;
  }

  const activeBatch = input.results.batches[input.activeBatchIndex];
  if (!activeBatch) {
    return null;
  }

  const blockingNotice = validateExportScope(activeBatch, input.scope);
  if (blockingNotice) {
    input.notify(blockingNotice);
    return null;
  }

  const preExportNotice = getPreExportNotice(activeBatch, input.scope);
  if (preExportNotice) {
    input.notify(preExportNotice);
  }

  const requestId = input.createRequestId();
  input.startRequest(requestId);

  try {
    const exportResult = await input.exportRows({
      connectionId: input.connectionId,
      requestId,
      sql: activeBatch.sql,
      schema: input.runtimeSchema ?? undefined,
      format: input.format,
      scope: input.scope,
      batchIndex: input.activeBatchIndex,
      ...buildExportRowsPayload(activeBatch, input.scope),
    });
    if (shouldIgnoreWorkbenchResponse({
      activeRequestId: input.getActiveRequestId(),
      requestId,
    })) {
      return null;
    }

    input.downloadResult(exportResult);
    input.notify(buildPostExportNotice(exportResult, input.scope));
    return exportResult;
  } catch (error) {
    if (shouldIgnoreWorkbenchResponse({
      activeRequestId: input.getActiveRequestId(),
      requestId,
    })) {
      return null;
    }
    const message = formatWorkbenchError(
      error,
      "Unable to export rows from the current result.",
    );
    input.notify(buildExportFailureNotice(message));
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
