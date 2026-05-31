import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
} from "@shared/schema";
import { isCellValueEqual } from "./result-grid-utils";
import { uniqueBy } from "./workbench-collection-utils";

export type PendingEditCells = Record<string, DbGridEditPatchCell>;
export type PendingDeleteRows = Record<string, DbGridDeleteRowDraft>;
export type PendingInsertedRows = Record<string, DbGridInsertedRowDraft>;

export type PendingGridCommitDrafts = {
  patchCells: DbGridEditPatchCell[];
  deletedRows: DbGridDeleteRowDraft[];
  insertedRows: DbGridInsertedRowDraft[];
};

export function buildGridPatchKey(rowPkTuple: string, columnName: string): string {
  return `${rowPkTuple}::${columnName}`;
}

export function removePendingDeleteForEdit(
  previous: PendingDeleteRows,
  rowPkTuple: string,
): PendingDeleteRows {
  if (!previous[rowPkTuple]) return previous;
  const next = { ...previous };
  delete next[rowPkTuple];
  return next;
}

export function applyPendingEditCell(
  previous: PendingEditCells,
  patch: DbGridEditPatchCell,
): PendingEditCells {
  const patchKey = buildGridPatchKey(patch.rowPkTuple, patch.columnName);
  const next = { ...previous };
  const existingPatch = previous[patchKey];
  const beforeValue = existingPatch?.beforeValue ?? patch.beforeValue;
  if (isCellValueEqual(beforeValue, patch.nextValue)) {
    delete next[patchKey];
    return next;
  }
  next[patchKey] = {
    ...patch,
    beforeValue,
  };
  return next;
}

export function createPendingInsertedRow(rowDraftId: string): DbGridInsertedRowDraft {
  return {
    rowDraftId,
    values: {},
  };
}

export function addPendingInsertedRow(
  previous: PendingInsertedRows,
  rowDraftId: string,
): PendingInsertedRows {
  return {
    ...previous,
    [rowDraftId]: createPendingInsertedRow(rowDraftId),
  };
}

export function editPendingInsertedRowValue(
  previous: PendingInsertedRows,
  rowDraftId: string,
  columnName: string,
  nextValue: string | number | boolean | null | undefined,
): PendingInsertedRows {
  const current = previous[rowDraftId];
  if (!current) return previous;

  const nextValues = { ...current.values };
  if (typeof nextValue === "undefined") {
    delete nextValues[columnName];
  } else {
    nextValues[columnName] = nextValue;
  }

  return {
    ...previous,
    [rowDraftId]: {
      ...current,
      values: nextValues,
    },
  };
}

export function discardPendingInsertedRow(
  previous: PendingInsertedRows,
  rowDraftId: string,
): PendingInsertedRows {
  if (!previous[rowDraftId]) return previous;
  const next = { ...previous };
  delete next[rowDraftId];
  return next;
}

export function discardPendingEditCell(
  previous: PendingEditCells,
  rowPkTuple: string,
  columnName: string,
): PendingEditCells {
  const patchKey = buildGridPatchKey(rowPkTuple, columnName);
  if (!previous[patchKey]) return previous;
  const next = { ...previous };
  delete next[patchKey];
  return next;
}

export function discardPendingEditRow(
  previous: PendingEditCells,
  rowPkTuple: string,
): PendingEditCells {
  const prefix = `${rowPkTuple}::`;
  const nextEntries = Object.entries(previous).filter(
    ([key]) => !key.startsWith(prefix),
  );
  if (nextEntries.length === Object.keys(previous).length) {
    return previous;
  }
  return Object.fromEntries(nextEntries);
}

export function discardPendingDeleteRow(
  previous: PendingDeleteRows,
  rowPkTuple: string,
): PendingDeleteRows {
  if (!previous[rowPkTuple]) return previous;
  const next = { ...previous };
  delete next[rowPkTuple];
  return next;
}

export function stagePendingDeleteRow(
  previous: PendingDeleteRows,
  row: DbGridDeleteRowDraft,
): PendingDeleteRows {
  return {
    ...previous,
    [row.rowPkTuple]: row,
  };
}

export function buildPendingGridCommitDrafts(
  pendingEditCells: PendingEditCells,
  pendingDeleteRows: PendingDeleteRows,
  pendingInsertedRows: PendingInsertedRows,
): PendingGridCommitDrafts {
  return {
    patchCells: uniqueBy(
      Object.values(pendingEditCells),
      (patch) => buildGridPatchKey(patch.rowPkTuple, patch.columnName),
    ),
    deletedRows: uniqueBy(
      Object.values(pendingDeleteRows),
      (row) => row.rowPkTuple,
    ),
    insertedRows: uniqueBy(
      Object.values(pendingInsertedRows).filter(
        (row) => Object.keys(row.values).length > 0,
      ),
      (row) => row.rowDraftId,
    ),
  };
}

export function hasPendingGridCommitDrafts(
  drafts: PendingGridCommitDrafts,
): boolean {
  return (
    drafts.patchCells.length > 0 ||
    drafts.deletedRows.length > 0 ||
    drafts.insertedRows.length > 0
  );
}
