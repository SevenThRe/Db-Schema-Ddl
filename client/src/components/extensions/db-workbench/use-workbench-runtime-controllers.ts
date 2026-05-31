import { useMemo, type MutableRefObject } from "react";
import type { HostApi } from "@/extensions/host-api";
import type {
  DbConnectionConfig,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import type { GridCommitStateActions } from "./grid-commit-runner";
import type { GridEditDraftActions } from "./grid-edit-draft-runner";
import type {
  PendingDeleteRows,
  PendingEditCells,
  PendingInsertedRows,
} from "./grid-edit-drafts";
import {
  downloadBinaryResult,
} from "./result-export-runtime";
import type { ResultExportStateActions } from "./result-export-runner";
import type { ResultWorkspaceStateActions } from "./result-workspace-runner";
import type { RequestLifecycleStateActions } from "./request-lifecycle-runner";
import {
  createWorkbenchGridEditController,
} from "./workbench-grid-edit-controller";
import {
  createWorkbenchLiveVerificationRunner,
  sleepWithBrowserTimer,
  type WorkbenchLiveVerificationSessionRunner,
} from "./live-verification-session-runner";
import {
  createWorkbenchResultWorkspaceController,
} from "./workbench-result-workspace-controller";
import type { ExportFormat, ExportScope } from "./ResultExportMenu";
import type { WorkbenchQueryControllers } from "./use-workbench-query-controllers";
import type { WorkbenchWorkflowControllers } from "./use-workbench-workflow-controllers";
import type { StarterQueryMode } from "./table-query-utils";

export interface WorkbenchRuntimeControllers {
  handleAddInsertedGridRow: () => void;
  handleCommitGridEdits: () => Promise<void>;
  handleDiscardGridEdits: () => void;
  handleDiscardInsertedGridRow: (rowDraftId: string) => void;
  handleEditCell: (patch: DbGridEditPatchCell) => void;
  handleEditInsertedGridRowValue: (
    rowDraftId: string,
    columnName: string,
    nextValue: string | number | boolean | null | undefined,
  ) => void;
  handlePrepareGridCommit: () => Promise<DbGridPrepareCommitResponse | null>;
  handleRevertGridCell: (rowPkTuple: string, columnName: string) => void;
  handleRevertGridDelete: (rowPkTuple: string) => void;
  handleRevertGridRow: (rowPkTuple: string) => void;
  handleStageDeleteGridRow: (row: DbGridDeleteRowDraft) => void;
  handleExport: (scope: ExportScope, format: ExportFormat) => Promise<unknown>;
  handleLoadMore: (batchIndex: number) => Promise<unknown>;
  liveVerificationRunner: WorkbenchLiveVerificationSessionRunner;
}

export interface UseWorkbenchRuntimeControllersInput {
  activeBatchIndex: number;
  activeExportRequestIdRef: MutableRefObject<string | null>;
  connection: DbConnectionConfig;
  executeImmediate: WorkbenchQueryControllers["executeImmediate"];
  getWindowCapNoticeShown: (batchIndex: number) => boolean;
  gridCommitStateActions: GridCommitStateActions;
  gridDraftActions: GridEditDraftActions;
  handleInspectObject: WorkbenchWorkflowControllers["handleInspectObject"];
  handleRunStarterQuery: (
    tableName: string,
    mode: StarterQueryMode,
  ) => Promise<void>;
  hostApi: HostApi;
  isCommittingGridEdit: boolean;
  isExecuting: boolean;
  isExporting: boolean;
  lastGridEditSource: DbGridEditSource | null;
  markWindowCapNoticeShown: (batchIndex: number) => void;
  pendingDeleteRows: PendingDeleteRows;
  pendingEditCells: PendingEditCells;
  pendingInsertedRows: PendingInsertedRows;
  preparedGridPlan: DbGridPrepareCommitResponse | null;
  requestLifecycleStateActions: RequestLifecycleStateActions;
  resultExportStateActions: ResultExportStateActions;
  resultWindowLimit: number;
  resultWorkspaceStateActions: ResultWorkspaceStateActions;
  results: QueryExecutionResponse | null;
  runtimeSchema?: string;
  selectedTableName: string | null;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  setResults: (
    updater: (
      previous: QueryExecutionResponse | null,
    ) => QueryExecutionResponse | null,
  ) => void;
  updateActiveTabSql: (sql: string) => void;
}

export function useWorkbenchRuntimeControllers(
  input: UseWorkbenchRuntimeControllersInput,
): WorkbenchRuntimeControllers {
  const gridEditController = useMemo(
    () =>
      createWorkbenchGridEditController({
        connectionId: input.connection.id,
        runtimeSchema: input.runtimeSchema,
        activeBatch: input.results?.batches[input.activeBatchIndex],
        fallbackSource: input.lastGridEditSource,
        pendingEditCells: input.pendingEditCells,
        pendingDeleteRows: input.pendingDeleteRows,
        pendingInsertedRows: input.pendingInsertedRows,
        preparedPlan: input.preparedGridPlan,
        isCommitting: input.isCommittingGridEdit,
        selectedTableName: input.selectedTableName,
        draftActions: input.gridDraftActions,
        commitActions: input.gridCommitStateActions,
        createInsertedRowDraftId: () => crypto.randomUUID(),
        prepareGridCommit: input.hostApi.connections.prepareGridCommit,
        commitGridEdits: input.hostApi.connections.commitGridEdits,
        refreshTable: (tableName) => input.handleRunStarterQuery(tableName, "select"),
        showNotification: input.hostApi.notifications.show,
      }),
    [
      input.activeBatchIndex,
      input.connection.id,
      input.gridCommitStateActions,
      input.gridDraftActions,
      input.handleRunStarterQuery,
      input.hostApi.connections,
      input.hostApi.notifications,
      input.isCommittingGridEdit,
      input.lastGridEditSource,
      input.pendingDeleteRows,
      input.pendingEditCells,
      input.pendingInsertedRows,
      input.preparedGridPlan,
      input.results?.batches,
      input.runtimeSchema,
      input.selectedTableName,
    ],
  );

  const resultWorkspaceController = useMemo(
    () =>
      createWorkbenchResultWorkspaceController({
        connectionId: input.connection.id,
        runtimeSchema: input.runtimeSchema,
        results: input.results,
        activeBatchIndex: input.activeBatchIndex,
        pendingEditCells: input.pendingEditCells,
        pendingDeleteRows: input.pendingDeleteRows,
        isExecuting: input.isExecuting,
        isExporting: input.isExporting,
        resultWindowLimit: input.resultWindowLimit,
        loadMoreLimit: 1000,
        fetchMore: input.hostApi.connections.fetchMore,
        updateResults: input.setResults,
        exportRows: input.hostApi.connections.exportRows,
        downloadResult: downloadBinaryResult,
        createExportRequestId: () => crypto.randomUUID(),
        getActiveExportRequestId: () => input.activeExportRequestIdRef.current,
        resultExportActions: input.resultExportStateActions,
        showNotification: input.hostApi.notifications.show,
        hasShownWindowCapNotice: input.getWindowCapNoticeShown,
        markWindowCapNoticeShown: input.markWindowCapNoticeShown,
      }),
    [
      input.activeBatchIndex,
      input.activeExportRequestIdRef,
      input.connection.id,
      input.getWindowCapNoticeShown,
      input.hostApi.connections,
      input.hostApi.notifications,
      input.isExecuting,
      input.isExporting,
      input.markWindowCapNoticeShown,
      input.pendingDeleteRows,
      input.pendingEditCells,
      input.resultExportStateActions,
      input.resultWindowLimit,
      input.results,
      input.runtimeSchema,
      input.setResults,
    ],
  );
  const { handleExport, handleLoadMore } = resultWorkspaceController;

  const liveVerificationRunner = useMemo(
    () =>
      createWorkbenchLiveVerificationRunner({
        inspectObject: input.handleInspectObject,
        updateActiveTabSql: input.updateActiveTabSql,
        setResultTab: input.resultWorkspaceStateActions.selectResultTab,
        setLastGridEditSource: input.setLastGridEditSource,
        executeImmediate: input.executeImmediate,
        loadMore: handleLoadMore,
        exportCurrentPage: () => handleExport("current_page", "json"),
        stageDeleteRow: gridEditController.handleStageDeleteGridRow,
        prepareGridCommit: gridEditController.handlePrepareGridCommit,
        revertGridDelete: gridEditController.handleRevertGridDelete,
        clearPreparedGridPlan: input.gridCommitStateActions.clearPreparedPlan,
        randomRequestId: () => crypto.randomUUID(),
        startCancelRequest: input.requestLifecycleStateActions.startCancelRequest,
        executeCancelQuery: input.hostApi.connections.executeQuery,
        cancelQuery: input.hostApi.connections.cancelQuery,
        finishCancelRequest: input.requestLifecycleStateActions.finishCancelRequest,
        sleep: sleepWithBrowserTimer,
      }),
    [
      gridEditController,
      handleExport,
      handleLoadMore,
      input.executeImmediate,
      input.gridCommitStateActions,
      input.handleInspectObject,
      input.hostApi.connections,
      input.requestLifecycleStateActions,
      input.resultWorkspaceStateActions,
      input.setLastGridEditSource,
      input.updateActiveTabSql,
    ],
  );

  return {
    handleAddInsertedGridRow: gridEditController.handleAddInsertedGridRow,
    handleCommitGridEdits: gridEditController.handleCommitGridEdits,
    handleDiscardGridEdits: gridEditController.handleDiscardGridEdits,
    handleDiscardInsertedGridRow: gridEditController.handleDiscardInsertedGridRow,
    handleEditCell: gridEditController.handleEditCell,
    handleEditInsertedGridRowValue:
      gridEditController.handleEditInsertedGridRowValue,
    handlePrepareGridCommit: gridEditController.handlePrepareGridCommit,
    handleRevertGridCell: gridEditController.handleRevertGridCell,
    handleRevertGridDelete: gridEditController.handleRevertGridDelete,
    handleRevertGridRow: gridEditController.handleRevertGridRow,
    handleStageDeleteGridRow: gridEditController.handleStageDeleteGridRow,
    handleExport,
    handleLoadMore,
    liveVerificationRunner,
  };
}
