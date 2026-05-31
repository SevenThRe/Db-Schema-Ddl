import { Copy, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DbQueryColumn } from "@shared/schema";
import {
  formatCellValue,
  type GridCellValue,
} from "./result-grid-row-model";

export interface SelectedRowInspectorProps {
  rowValues: GridCellValue[] | null;
  rowPkTuple: string | null;
  insertDraftId?: string | null;
  isInsertDraft?: boolean;
  includedColumnNames?: Set<string>;
  dirtyColumnNames?: Set<string>;
  isPendingDelete?: boolean;
  columns: DbQueryColumn[];
  rowIndex: number | null;
  canStageDelete: boolean;
  onCopyRowJson: () => void;
  onCopyRowTsv: () => void;
  onCopyCell: (column: DbQueryColumn, value: GridCellValue) => void;
  onRevertCell: (columnName: string) => void;
  onRevertRow: () => void;
  onDiscardInsertedRow: () => void;
  onStageDeleteRow: () => void;
  onRevertDeleteRow: () => void;
}

export function SelectedRowInspector({
  rowValues,
  rowPkTuple,
  insertDraftId,
  isInsertDraft = false,
  includedColumnNames,
  dirtyColumnNames,
  isPendingDelete = false,
  columns,
  rowIndex,
  canStageDelete,
  onCopyRowJson,
  onCopyRowTsv,
  onCopyCell,
  onRevertCell,
  onRevertRow,
  onDiscardInsertedRow,
  onStageDeleteRow,
  onRevertDeleteRow,
}: SelectedRowInspectorProps) {
  const dirtyFieldCount = dirtyColumnNames?.size ?? 0;

  return (
    <div className="shrink-0 border-t border-border bg-background/95">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Row Inspector
          </p>
          <p className="mt-0.5 text-xs text-foreground">
            {isInsertDraft && rowValues
              ? `Insert draft ${insertDraftId?.slice(0, 8) ?? ""} · ${dirtyFieldCount} field${dirtyFieldCount === 1 ? "" : "s"} included`
              : rowValues && rowIndex !== null
                ? `Loaded row ${rowIndex.toLocaleString()} · inspect and copy field values${dirtyFieldCount > 0 ? ` · ${dirtyFieldCount} pending field${dirtyFieldCount > 1 ? "s" : ""}` : ""}${isPendingDelete ? " · pending delete" : ""}`
                : "Select a row to inspect fields, verify values, and continue from the result set."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={isInsertDraft ? onDiscardInsertedRow : onRevertRow}
            disabled={isInsertDraft ? !insertDraftId : !rowPkTuple || dirtyFieldCount === 0}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {isInsertDraft ? "Discard draft" : "Revert row"}
          </Button>
          {!isInsertDraft ? (
            <Button
              variant={isPendingDelete ? "outline" : "destructive"}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={isPendingDelete ? onRevertDeleteRow : onStageDeleteRow}
              disabled={!rowPkTuple || !canStageDelete}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              {isPendingDelete ? "Revert delete" : "Stage delete"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onCopyRowJson}
            disabled={!rowValues}
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onCopyRowTsv}
            disabled={!rowValues}
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy TSV
          </Button>
        </div>
      </div>

      {rowValues ? (
        <div className="max-h-44 overflow-auto border-t border-border">
          {columns.map((column, index) => {
            const value = rowValues[index] ?? null;
            const isDraftDefault = isInsertDraft && !includedColumnNames?.has(column.name);
            const displayValue = isDraftDefault ? "DEFAULT" : formatCellValue(value);
            const isDirty = dirtyColumnNames?.has(column.name) ?? false;
            return (
              <div
                key={`${column.name}:${index}`}
                className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] items-start gap-3 border-b border-border/70 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] font-medium text-foreground">
                    {column.name}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {column.dataType}
                  </div>
                </div>
                <div className="min-w-0">
                  <div
                    className={cn(
                      "break-all rounded-sm border px-2 py-1 font-mono text-[11px]",
                      isPendingDelete
                        ? "border-destructive/40 bg-destructive/5"
                        : isDraftDefault
                          ? "border-sky-500/30 bg-sky-500/5"
                          : isDirty
                            ? "border-amber-500/40 bg-amber-500/10"
                            : "border-border bg-muted/20",
                      value === null || isDraftDefault
                        ? "italic text-muted-foreground"
                        : "text-foreground",
                      isPendingDelete ? "line-through opacity-70" : undefined,
                    )}
                  >
                    {displayValue}
                  </div>
                  {isDraftDefault ? (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
                      default
                    </p>
                  ) : null}
                  {isPendingDelete ? (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-destructive">
                      pending delete
                    </p>
                  ) : null}
                  {isDirty ? (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
                      pending
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => onCopyCell(column, value)}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </Button>
                  {(isDirty || isDraftDefault) && !isPendingDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-6 px-2 text-[10px]",
                        isInsertDraft
                          ? "text-sky-700 hover:text-sky-800 dark:text-sky-300"
                          : "text-amber-700 hover:text-amber-800 dark:text-amber-300",
                      )}
                      onClick={() => onRevertCell(column.name)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      {isInsertDraft ? "Unset" : "Revert"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
