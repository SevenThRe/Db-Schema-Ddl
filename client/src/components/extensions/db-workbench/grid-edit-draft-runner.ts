import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
} from "@shared/schema";
import {
  addPendingInsertedRow,
  applyPendingEditCell,
  discardPendingDeleteRow,
  discardPendingEditCell,
  discardPendingEditRow,
  discardPendingInsertedRow,
  editPendingInsertedRowValue,
  removePendingDeleteForEdit,
  stagePendingDeleteRow,
  type PendingDeleteRows,
  type PendingEditCells,
  type PendingInsertedRows,
} from "./grid-edit-drafts";

type DraftUpdater<T> = (updater: (previous: T) => T) => void;

export interface GridEditDraftActions {
  updateEditCells: DraftUpdater<PendingEditCells>;
  updateDeleteRows: DraftUpdater<PendingDeleteRows>;
  updateInsertedRows: DraftUpdater<PendingInsertedRows>;
  clearPreparedPlan: () => void;
}

export function createGridEditDraftStateActions(input: {
  setPendingEditCells: DraftUpdater<PendingEditCells>;
  setPendingDeleteRows: DraftUpdater<PendingDeleteRows>;
  setPendingInsertedRows: DraftUpdater<PendingInsertedRows>;
  setPreparedGridPlan: (plan: null) => void;
}): GridEditDraftActions {
  return {
    updateEditCells: input.setPendingEditCells,
    updateDeleteRows: input.setPendingDeleteRows,
    updateInsertedRows: input.setPendingInsertedRows,
    clearPreparedPlan: () => input.setPreparedGridPlan(null),
  };
}

export function runEditGridCellDraft(
  actions: GridEditDraftActions,
  patch: DbGridEditPatchCell,
): void {
  actions.updateDeleteRows((previous) =>
    removePendingDeleteForEdit(previous, patch.rowPkTuple),
  );
  actions.updateEditCells((previous) => applyPendingEditCell(previous, patch));
  actions.clearPreparedPlan();
}

export function runAddInsertedGridRowDraft(
  actions: GridEditDraftActions,
  rowDraftId: string,
): void {
  actions.updateInsertedRows((previous) =>
    addPendingInsertedRow(previous, rowDraftId),
  );
  actions.clearPreparedPlan();
}

export function runEditInsertedGridRowDraft(
  actions: GridEditDraftActions,
  rowDraftId: string,
  columnName: string,
  nextValue: string | number | boolean | null | undefined,
): void {
  actions.updateInsertedRows((previous) =>
    editPendingInsertedRowValue(previous, rowDraftId, columnName, nextValue),
  );
  actions.clearPreparedPlan();
}

export function runDiscardInsertedGridRowDraft(
  actions: GridEditDraftActions,
  rowDraftId: string,
): void {
  actions.updateInsertedRows((previous) =>
    discardPendingInsertedRow(previous, rowDraftId),
  );
  actions.clearPreparedPlan();
}

export function runDiscardGridEditDrafts(actions: GridEditDraftActions): void {
  actions.updateEditCells(() => ({}));
  actions.updateDeleteRows(() => ({}));
  actions.updateInsertedRows(() => ({}));
  actions.clearPreparedPlan();
}

export function runRevertGridCellDraft(
  actions: GridEditDraftActions,
  rowPkTuple: string,
  columnName: string,
): void {
  actions.updateEditCells((previous) =>
    discardPendingEditCell(previous, rowPkTuple, columnName),
  );
  actions.clearPreparedPlan();
}

export function runRevertGridRowDraft(
  actions: GridEditDraftActions,
  rowPkTuple: string,
): void {
  actions.updateEditCells((previous) =>
    discardPendingEditRow(previous, rowPkTuple),
  );
  actions.updateDeleteRows((previous) =>
    discardPendingDeleteRow(previous, rowPkTuple),
  );
  actions.clearPreparedPlan();
}

export function runStageDeleteGridRowDraft(
  actions: GridEditDraftActions,
  row: DbGridDeleteRowDraft,
): void {
  actions.updateEditCells((previous) =>
    discardPendingEditRow(previous, row.rowPkTuple),
  );
  actions.updateDeleteRows((previous) => stagePendingDeleteRow(previous, row));
  actions.clearPreparedPlan();
}

export function runRevertGridDeleteDraft(
  actions: GridEditDraftActions,
  rowPkTuple: string,
): void {
  actions.updateDeleteRows((previous) =>
    discardPendingDeleteRow(previous, rowPkTuple),
  );
  actions.clearPreparedPlan();
}
