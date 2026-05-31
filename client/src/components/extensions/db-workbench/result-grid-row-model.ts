import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbQueryColumn,
  DbQueryRow,
} from "@shared/schema";
import { formatGridCellValue, type GridCellValue } from "./grid-edit-summary";

export type { GridCellValue } from "./grid-edit-summary";

export interface LoadedGridRowView {
  kind: "loaded";
  row: DbQueryRow;
  sourceIndex: number;
  rowPrimaryKey: Record<string, GridCellValue> | null;
  rowPkTuple: string | null;
  displayValues: GridCellValue[];
  dirtyColumnNames: Set<string>;
  isPendingDelete: boolean;
}

export interface DraftGridRowView {
  kind: "insert-draft";
  rowDraftId: string;
  sourceIndex: number;
  displayValues: GridCellValue[];
  includedColumnNames: Set<string>;
  dirtyColumnNames: Set<string>;
  isPendingDelete: false;
}

export type GridRowView = LoadedGridRowView | DraftGridRowView;

export function calcDefaultColumnWidth(col: DbQueryColumn): number {
  const nameLen = col.name.length;
  const typeLen = col.dataType?.length ?? 0;
  const estimated = Math.max(nameLen, typeLen) * 8 + 24;
  return Math.min(300, Math.max(60, estimated));
}

export function formatCellValue(value: GridCellValue): string {
  return formatGridCellValue(value);
}

export function valuesToObject(
  values: GridCellValue[],
  columns: DbQueryColumn[],
): Record<string, GridCellValue> {
  return Object.fromEntries(
    columns.map((column, index) => [column.name, values[index] ?? null]),
  );
}

export function valuesToTsv(
  values: GridCellValue[],
  columns: DbQueryColumn[],
): string {
  const header = columns.map((column) => column.name).join("\t");
  const rowValues = values.map((value) => formatCellValue(value)).join("\t");
  return `${header}\n${rowValues}`;
}

export function buildRowPrimaryKey(
  row: DbQueryRow,
  columns: DbQueryColumn[],
  primaryKeyColumns: string[],
): Record<string, GridCellValue> | null {
  const rowPrimaryKey: Record<string, GridCellValue> = {};
  for (const primaryKeyColumn of primaryKeyColumns) {
    const columnIndex = columns.findIndex((column) => column.name === primaryKeyColumn);
    if (columnIndex < 0) {
      return null;
    }
    rowPrimaryKey[primaryKeyColumn] = row.values[columnIndex] ?? null;
  }
  return rowPrimaryKey;
}

export function buildRowPkTuple(
  rowPrimaryKey: Record<string, GridCellValue>,
  primaryKeyColumns: string[],
): string {
  return primaryKeyColumns
    .map((column) => `${column}=${formatCellValue(rowPrimaryKey[column] ?? null)}`)
    .join("|");
}

export function parseEditedValue(
  originalValue: GridCellValue,
  editedRawValue: string,
): GridCellValue {
  if (originalValue === null) {
    return editedRawValue === "" ? null : editedRawValue;
  }
  if (typeof originalValue === "boolean") {
    const normalized = editedRawValue.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof originalValue === "number") {
    const asNumber = Number(editedRawValue);
    return Number.isNaN(asNumber) ? editedRawValue : asNumber;
  }
  return editedRawValue;
}

export function buildPendingEditLookup(
  pendingEditCells: Record<string, DbGridEditPatchCell>,
): Map<string, Map<string, DbGridEditPatchCell>> {
  const byRow = new Map<string, Map<string, DbGridEditPatchCell>>();
  for (const patch of Object.values(pendingEditCells)) {
    let rowMap = byRow.get(patch.rowPkTuple);
    if (!rowMap) {
      rowMap = new Map<string, DbGridEditPatchCell>();
      byRow.set(patch.rowPkTuple, rowMap);
    }
    rowMap.set(patch.columnName, patch);
  }
  return byRow;
}

export function buildPendingDeleteLookup(
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>,
): Map<string, DbGridDeleteRowDraft> {
  return new Map(
    Object.values(pendingDeleteRows).map((row) => [row.rowPkTuple, row]),
  );
}

export function buildGridRowView(
  row: DbQueryRow,
  sourceIndex: number,
  columns: DbQueryColumn[],
  primaryKeyColumns: string[],
  pendingEditLookup: Map<string, Map<string, DbGridEditPatchCell>>,
  pendingDeleteLookup: Map<string, DbGridDeleteRowDraft>,
): GridRowView {
  const rowPrimaryKey = buildRowPrimaryKey(row, columns, primaryKeyColumns);
  const rowPkTuple =
    rowPrimaryKey && primaryKeyColumns.length > 0
      ? buildRowPkTuple(rowPrimaryKey, primaryKeyColumns)
      : null;
  const pendingRowCells = rowPkTuple ? pendingEditLookup.get(rowPkTuple) : undefined;
  const displayValues = columns.map(
    (column, index) => pendingRowCells?.get(column.name)?.nextValue ?? row.values[index] ?? null,
  );

  return {
    kind: "loaded",
    row,
    sourceIndex,
    rowPrimaryKey,
    rowPkTuple,
    displayValues,
    dirtyColumnNames: new Set(pendingRowCells?.keys() ?? []),
    isPendingDelete: rowPkTuple ? pendingDeleteLookup.has(rowPkTuple) : false,
  };
}

export function buildInsertedRowView(
  draft: DbGridInsertedRowDraft,
  columns: DbQueryColumn[],
): DraftGridRowView {
  const includedColumnNames = new Set(Object.keys(draft.values));
  return {
    kind: "insert-draft",
    rowDraftId: draft.rowDraftId,
    sourceIndex: -1,
    displayValues: columns.map((column) =>
      includedColumnNames.has(column.name) ? draft.values[column.name] ?? null : null,
    ),
    includedColumnNames,
    dirtyColumnNames: includedColumnNames,
    isPendingDelete: false,
  };
}

export function parseInsertedValue(editedRawValue: string):
  | { kind: "unset" }
  | { kind: "value"; value: GridCellValue } {
  const trimmed = editedRawValue.trim();
  if (!trimmed) {
    return { kind: "unset" };
  }
  if (/^null$/i.test(trimmed)) {
    return { kind: "value", value: null };
  }
  if (/^true$/i.test(trimmed)) {
    return { kind: "value", value: true };
  }
  if (/^false$/i.test(trimmed)) {
    return { kind: "value", value: false };
  }
  if (trimmed === "\"\"" || trimmed === "''") {
    return { kind: "value", value: "" };
  }

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && trimmed !== "") {
    return { kind: "value", value: asNumber };
  }

  return { kind: "value", value: editedRawValue };
}
