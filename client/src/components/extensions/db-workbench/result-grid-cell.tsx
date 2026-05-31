import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DbColumnSchema, DbQueryColumn } from "@shared/schema";
import {
  formatCellValue,
  type GridRowView,
} from "./result-grid-row-model";

export function ResultGridCell({
  rowView,
  rowIndex,
  column,
  columnIndex,
  columnWidth,
  isEditEnabled,
  isPrimaryKeyColumn,
  isCellEditing,
  editingValue,
  columnMetadata,
  onEditingValueChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: {
  rowView: GridRowView;
  rowIndex: number;
  column: DbQueryColumn;
  columnIndex: number;
  columnWidth: number;
  isEditEnabled: boolean;
  isPrimaryKeyColumn: boolean;
  isCellEditing: boolean;
  editingValue: string;
  columnMetadata?: DbColumnSchema;
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
  const value = rowView.displayValues[columnIndex] ?? null;
  const isInsertDraft = rowView.kind === "insert-draft";
  const isPendingDelete = rowView.isPendingDelete;
  const isDraftDefault =
    rowView.kind === "insert-draft" && !rowView.includedColumnNames.has(column.name);
  const displayValue = isDraftDefault ? "DEFAULT" : formatCellValue(value);
  const isNull = !isDraftDefault && value === null;
  const isDirty = rowView.dirtyColumnNames.has(column.name);
  const canEditCell = isEditEnabled && !isPrimaryKeyColumn && !isPendingDelete;

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "shrink-0 overflow-hidden border-r border-border px-2",
              isInsertDraft && !isCellEditing ? "bg-sky-500/5" : undefined,
              isPendingDelete && !isCellEditing ? "bg-destructive/5" : undefined,
              isDirty && !isCellEditing ? "bg-amber-500/10" : undefined,
            )}
            style={{ width: columnWidth, height: 32 }}
            onDoubleClick={() => onStartEdit(rowView, rowIndex, column, columnIndex)}
          >
            {isCellEditing ? (
              <input
                autoFocus
                value={editingValue}
                onChange={(event) => onEditingValueChange(event.target.value)}
                onBlur={() =>
                  onCommitEdit(rowView, rowIndex, column, columnIndex, editingValue)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommitEdit(rowView, rowIndex, column, columnIndex, editingValue);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelEdit();
                  }
                }}
                className="mt-[3px] h-6 w-full rounded-sm border border-border bg-background px-1 text-xs font-mono text-foreground outline-none"
              />
            ) : (
              <span
                className={cn(
                  "block truncate text-xs font-mono leading-8",
                  isDraftDefault || isNull ? "italic text-muted-foreground" : "text-foreground",
                  canEditCell ? "cursor-text" : undefined,
                  isPrimaryKeyColumn ? "text-muted-foreground" : undefined,
                  isPendingDelete ? "line-through opacity-70" : undefined,
                  isDirty && !isDraftDefault
                    ? "font-semibold text-amber-900 dark:text-amber-100"
                    : undefined,
                )}
                title={isPrimaryKeyColumn ? "Primary key column (read-only)" : undefined}
              >
                {displayValue}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="max-w-xs break-all font-mono text-xs">
            {displayValue}
          </p>
          {isDraftDefault ? (
            <p className="mt-1 text-[10px] text-sky-700 dark:text-sky-300">
              Omitted from INSERT. Database default will apply.
            </p>
          ) : null}
          {isDirty ? (
            <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
              Pending edit
            </p>
          ) : null}
          {isPendingDelete ? (
            <p className="mt-1 text-[10px] text-destructive">
              Pending delete
            </p>
          ) : null}
          {isPrimaryKeyColumn ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Primary key column (read-only)
            </p>
          ) : null}
          {columnMetadata?.defaultValue ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Default: {columnMetadata.defaultValue}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
