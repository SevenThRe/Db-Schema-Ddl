import type {
  DbGridCommitRequest,
  DbGridCommitResponse,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
} from "@shared/schema";
import {
  runCommitGridEdits,
  runPrepareGridCommit,
  type GridCommitStateActions,
} from "./grid-commit-runner";
import {
  runAddInsertedGridRowDraft,
  runDiscardGridEditDrafts,
  runDiscardInsertedGridRowDraft,
  runEditGridCellDraft,
  runEditInsertedGridRowDraft,
  runRevertGridCellDraft,
  runRevertGridDeleteDraft,
  runRevertGridRowDraft,
  runStageDeleteGridRowDraft,
  type GridEditDraftActions,
} from "./grid-edit-draft-runner";
import type {
  PendingDeleteRows,
  PendingEditCells,
  PendingInsertedRows,
} from "./grid-edit-drafts";
import type { GridCommitNotice } from "./grid-commit-runtime";

export interface WorkbenchGridEditController {
  handleEditCell: (patch: DbGridEditPatchCell) => void;
  handleAddInsertedGridRow: () => void;
  handleEditInsertedGridRowValue: (
    rowDraftId: string,
    columnName: string,
    nextValue: string | number | boolean | null | undefined,
  ) => void;
  handleDiscardInsertedGridRow: (rowDraftId: string) => void;
  handleDiscardGridEdits: () => void;
  handleRevertGridCell: (rowPkTuple: string, columnName: string) => void;
  handleRevertGridRow: (rowPkTuple: string) => void;
  handleStageDeleteGridRow: (row: DbGridDeleteRowDraft) => void;
  handleRevertGridDelete: (rowPkTuple: string) => void;
  handlePrepareGridCommit: () => Promise<DbGridPrepareCommitResponse | null>;
  handleCommitGridEdits: () => Promise<void>;
}

export function createWorkbenchGridEditController(input: {
  connectionId: string;
  runtimeSchema?: string | null;
  activeBatch: DbQueryBatchResult | null | undefined;
  fallbackSource: DbGridEditSource | null;
  pendingEditCells: PendingEditCells;
  pendingDeleteRows: PendingDeleteRows;
  pendingInsertedRows: PendingInsertedRows;
  preparedPlan: DbGridPrepareCommitResponse | null;
  isCommitting: boolean;
  selectedTableName: string | null;
  draftActions: GridEditDraftActions;
  commitActions: GridCommitStateActions;
  createInsertedRowDraftId: () => string;
  prepareGridCommit: (
    request: DbGridPrepareCommitRequest,
  ) => Promise<DbGridPrepareCommitResponse>;
  commitGridEdits: (
    request: DbGridCommitRequest,
  ) => Promise<DbGridCommitResponse>;
  refreshTable: (tableName: string) => Promise<unknown>;
  showNotification: (notice: GridCommitNotice) => void;
}): WorkbenchGridEditController {
  return {
    handleEditCell: (patch) => {
      runEditGridCellDraft(input.draftActions, patch);
    },
    handleAddInsertedGridRow: () => {
      runAddInsertedGridRowDraft(
        input.draftActions,
        input.createInsertedRowDraftId(),
      );
    },
    handleEditInsertedGridRowValue: (rowDraftId, columnName, nextValue) => {
      runEditInsertedGridRowDraft(
        input.draftActions,
        rowDraftId,
        columnName,
        nextValue,
      );
    },
    handleDiscardInsertedGridRow: (rowDraftId) => {
      runDiscardInsertedGridRowDraft(input.draftActions, rowDraftId);
    },
    handleDiscardGridEdits: () => {
      runDiscardGridEditDrafts(input.draftActions);
    },
    handleRevertGridCell: (rowPkTuple, columnName) => {
      runRevertGridCellDraft(input.draftActions, rowPkTuple, columnName);
    },
    handleRevertGridRow: (rowPkTuple) => {
      runRevertGridRowDraft(input.draftActions, rowPkTuple);
    },
    handleStageDeleteGridRow: (row) => {
      runStageDeleteGridRowDraft(input.draftActions, row);
    },
    handleRevertGridDelete: (rowPkTuple) => {
      runRevertGridDeleteDraft(input.draftActions, rowPkTuple);
    },
    handlePrepareGridCommit: async () =>
      runPrepareGridCommit({
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        activeBatch: input.activeBatch,
        fallbackSource: input.fallbackSource,
        pendingEditCells: input.pendingEditCells,
        pendingDeleteRows: input.pendingDeleteRows,
        pendingInsertedRows: input.pendingInsertedRows,
        prepareGridCommit: input.prepareGridCommit,
        showNotification: input.showNotification,
        beginPrepare: input.commitActions.beginPrepare,
        applyPreparedPlan: input.commitActions.applyPreparedPlan,
        finishPrepare: input.commitActions.finishPrepare,
      }),
    handleCommitGridEdits: async () => {
      await runCommitGridEdits({
        connectionId: input.connectionId,
        preparedPlan: input.preparedPlan,
        isCommitting: input.isCommitting,
        selectedTableName: input.selectedTableName,
        commitGridEdits: input.commitGridEdits,
        refreshTable: input.refreshTable,
        showNotification: input.showNotification,
        beginCommit: input.commitActions.beginCommit,
        clearPreparedPlan: input.commitActions.clearPreparedPlan,
        clearDrafts: input.commitActions.clearDrafts,
        finishCommit: input.commitActions.finishCommit,
      });
    },
  };
}
