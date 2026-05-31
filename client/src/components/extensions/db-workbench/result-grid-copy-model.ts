import {
  valuesToObject,
  valuesToTsv,
  type GridRowView,
} from "./result-grid-row-model";
import type { DbQueryColumn } from "@shared/schema";

export function buildSelectedRowJson(rowView: GridRowView, columns: DbQueryColumn[]): string {
  if (rowView.kind === "insert-draft") {
    return JSON.stringify(
      Object.fromEntries(
        columns
          .filter((column) => rowView.includedColumnNames.has(column.name))
          .map((column) => {
            const columnIndex = columns.findIndex((item) => item.name === column.name);
            return [column.name, rowView.displayValues[columnIndex] ?? null];
          }),
      ),
      null,
      2,
    );
  }

  return JSON.stringify(valuesToObject(rowView.displayValues, columns), null, 2);
}

export function buildSelectedRowTsv(rowView: GridRowView, columns: DbQueryColumn[]): string {
  if (rowView.kind === "insert-draft") {
    const includedColumns = columns.filter((column) =>
      rowView.includedColumnNames.has(column.name),
    );
    const includedValues = includedColumns.map((column) => {
      const columnIndex = columns.findIndex((item) => item.name === column.name);
      return rowView.displayValues[columnIndex] ?? null;
    });
    return valuesToTsv(includedValues, includedColumns);
  }

  return valuesToTsv(rowView.displayValues, columns);
}
