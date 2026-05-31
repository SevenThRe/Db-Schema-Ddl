import type {
  BinaryCommandResult,
  DbQueryBatchResult,
  ExportRowsRequest,
  FetchMoreRequest,
  QueryExecutionResponse,
} from "@shared/schema";
import type { ToastOptions } from "@/extensions/host-api";
import type { ExportFormat, ExportScope } from "./ResultExportMenu";
import type {
  PendingDeleteRows,
  PendingEditCells,
} from "./grid-edit-drafts";
import {
  runResultLoadMore,
} from "./result-load-more-runner";
import type { LoadMoreNotice } from "./result-load-more-runtime";
import {
  runWorkbenchResultExport,
  type ResultExportStateActions,
} from "./result-export-runner";

export interface WorkbenchResultWorkspaceController {
  handleLoadMore: (batchIndex: number) => Promise<DbQueryBatchResult | null>;
  handleExport: (
    scope: ExportScope,
    format: ExportFormat,
  ) => Promise<BinaryCommandResult | null>;
}

export function createWorkbenchResultWorkspaceController(input: {
  connectionId: string;
  runtimeSchema?: string | null;
  results: QueryExecutionResponse | null;
  activeBatchIndex: number;
  pendingEditCells: PendingEditCells;
  pendingDeleteRows: PendingDeleteRows;
  isExecuting: boolean;
  isExporting: boolean;
  resultWindowLimit: number;
  loadMoreLimit: number;
  fetchMore: (request: FetchMoreRequest) => Promise<DbQueryBatchResult>;
  updateResults: (
    updater: (
      previous: QueryExecutionResponse | null,
    ) => QueryExecutionResponse | null,
  ) => void;
  exportRows: (request: ExportRowsRequest) => Promise<BinaryCommandResult>;
  downloadResult: (result: BinaryCommandResult) => void;
  createExportRequestId: () => string;
  getActiveExportRequestId: () => string | null;
  resultExportActions: ResultExportStateActions;
  showNotification: (notice: LoadMoreNotice | ToastOptions) => void;
  hasShownWindowCapNotice: (batchIndex: number) => boolean;
  markWindowCapNoticeShown: (batchIndex: number) => void;
}): WorkbenchResultWorkspaceController {
  return {
    handleLoadMore: (batchIndex) =>
      runResultLoadMore({
        results: input.results,
        batchIndex,
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        pendingEditCells: input.pendingEditCells,
        pendingDeleteRows: input.pendingDeleteRows,
        windowLimit: input.resultWindowLimit,
        limit: input.loadMoreLimit,
        fetchMore: input.fetchMore,
        updateResults: input.updateResults,
        showNotification: input.showNotification,
        hasShownWindowCapNotice: input.hasShownWindowCapNotice,
        markWindowCapNoticeShown: input.markWindowCapNoticeShown,
      }),
    handleExport: (scope, format) =>
      runWorkbenchResultExport({
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        results: input.results,
        activeBatchIndex: input.activeBatchIndex,
        scope,
        format,
        isExecuting: input.isExecuting,
        isExporting: input.isExporting,
        createRequestId: input.createExportRequestId,
        getActiveRequestId: input.getActiveExportRequestId,
        startRequest: input.resultExportActions.startRequest,
        exportRows: input.exportRows,
        downloadResult: input.downloadResult,
        notify: input.showNotification,
        finishRequest: input.resultExportActions.finishRequest,
      }),
  };
}
