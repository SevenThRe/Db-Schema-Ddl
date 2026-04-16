import type { DbGridDeleteRowDraft, DbGridEditPatchCell } from "@shared/schema";

export type GridCellValue = string | number | boolean | null;

export interface PendingEditCellSummary {
  columnName: string;
  beforeValue: GridCellValue;
  nextValue: GridCellValue;
}

export interface PendingEditRowSummary {
  rowPkTuple: string;
  rowKeyLabel: string;
  changeCount: number;
  cells: PendingEditCellSummary[];
}

export interface PendingDeleteRowSummary {
  rowPkTuple: string;
  rowKeyLabel: string;
}

export function formatGridCellValue(value: GridCellValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function buildPendingEditRowSummaries(
  pendingEditCells: Record<string, DbGridEditPatchCell>,
): PendingEditRowSummary[] {
  const rowMap = new Map<string, DbGridEditPatchCell[]>();

  for (const patch of Object.values(pendingEditCells)) {
    const existing = rowMap.get(patch.rowPkTuple);
    if (existing) {
      existing.push(patch);
    } else {
      rowMap.set(patch.rowPkTuple, [patch]);
    }
  }

  return Array.from(rowMap.entries())
    .map(([rowPkTuple, patches]) => {
      const sortedPatches = [...patches].sort((left, right) =>
        left.columnName.localeCompare(right.columnName),
      );
      const rowPrimaryKey = sortedPatches[0]?.rowPrimaryKey ?? {};
      const rowKeyLabel = Object.keys(rowPrimaryKey)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => `${key}=${formatGridCellValue(rowPrimaryKey[key] ?? null)}`)
        .join(", ");

      return {
        rowPkTuple,
        rowKeyLabel: rowKeyLabel || rowPkTuple,
        changeCount: sortedPatches.length,
        cells: sortedPatches.map((patch) => ({
          columnName: patch.columnName,
          beforeValue: patch.beforeValue,
          nextValue: patch.nextValue,
        })),
      } satisfies PendingEditRowSummary;
    })
    .sort((left, right) => left.rowKeyLabel.localeCompare(right.rowKeyLabel));
}

export function buildPendingDeleteRowSummaries(
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>,
): PendingDeleteRowSummary[] {
  return Object.values(pendingDeleteRows)
    .map((row) => {
      const rowKeyLabel = Object.keys(row.rowPrimaryKey)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => `${key}=${formatGridCellValue(row.rowPrimaryKey[key] ?? null)}`)
        .join(", ");

      return {
        rowPkTuple: row.rowPkTuple,
        rowKeyLabel: rowKeyLabel || row.rowPkTuple,
      } satisfies PendingDeleteRowSummary;
    })
    .sort((left, right) => left.rowKeyLabel.localeCompare(right.rowKeyLabel));
}
