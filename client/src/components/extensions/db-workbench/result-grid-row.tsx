import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { DbColumnSchema, DbQueryColumn } from "@shared/schema";
import { ResultGridCell } from "./result-grid-cell";
import type { GridRowView } from "./result-grid-row-model";

export function ResultGridRow({
  rowView,
  rowIndex,
  style,
  columns,
  columnWidths,
  isSelected,
  isEditEnabled,
  primaryKeySet,
  editingCell,
  editingValue,
  columnMetadataByName,
  onSelectRow,
  onEditingValueChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: {
  rowView: GridRowView;
  rowIndex: number;
  style: CSSProperties;
  columns: DbQueryColumn[];
  columnWidths: number[];
  isSelected: boolean;
  isEditEnabled: boolean;
  primaryKeySet: Set<string>;
  editingCell: { rowIndex: number; columnName: string } | null;
  editingValue: string;
  columnMetadataByName: Map<string, DbColumnSchema>;
  onSelectRow: (rowIndex: number) => void;
  onEditingValueChange: (value: string) => void;
  onStartEdit: (
    rowView: GridRowView,
    rowIndex: number,
    column: DbQueryColumn,
    columnIndex: number,
  ) => void;
  onCommitEdit: (
    rowView: GridRowView,
    rowIndex: number,
    column: DbQueryColumn,
    columnIndex: number,
    nextRawValue: string,
  ) => void;
  onCancelEdit: () => void;
}) {
  const hasDirtyCells = rowView.dirtyColumnNames.size > 0;
  const isPendingDelete = rowView.isPendingDelete;
  const isInsertDraft = rowView.kind === "insert-draft";

  return (
    <div
      style={style}
      role="row"
      aria-selected={isSelected}
      className={cn(
        "flex cursor-pointer items-center border-b border-border",
        isSelected
          ? isInsertDraft
            ? "bg-sky-500/10"
            : isPendingDelete
              ? "bg-destructive/10"
              : "bg-primary/10"
          : isInsertDraft
            ? "bg-sky-500/5 hover:bg-sky-500/10"
            : isPendingDelete
              ? "bg-destructive/5 hover:bg-destructive/10"
              : hasDirtyCells
                ? "bg-amber-500/5 hover:bg-amber-500/10"
                : "hover:bg-muted/40",
      )}
      onClick={() => onSelectRow(rowIndex)}
    >
      {columns.map((column, columnIndex) => (
        <ResultGridCell
          key={`${column.name}:${columnIndex}`}
          rowView={rowView}
          rowIndex={rowIndex}
          column={column}
          columnIndex={columnIndex}
          columnWidth={columnWidths[columnIndex]}
          isEditEnabled={isEditEnabled}
          isPrimaryKeyColumn={rowView.kind === "loaded" && primaryKeySet.has(column.name)}
          isCellEditing={
            editingCell?.rowIndex === rowIndex &&
            editingCell.columnName === column.name
          }
          editingValue={editingValue}
          columnMetadata={columnMetadataByName.get(column.name)}
          onEditingValueChange={onEditingValueChange}
          onStartEdit={onStartEdit}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
        />
      ))}
    </div>
  );
}
