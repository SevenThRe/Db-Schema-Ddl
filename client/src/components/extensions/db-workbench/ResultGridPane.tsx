// ResultGridPane — 仮想スクロール付き結果グリッド
//
// 機能:
//   - react-window List による仮想スクロール
//   - スティッキーカラムヘッダー + カラム幅ドラッグリサイズ
//   - マルチバッチタブ（複数ステートメント結果）
//   - ロードモア
//   - Stop on error トグル
//   - 選択行インスペクター（値確認 + コピー）
//   - フィルター / 空状態 / エラー状態

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { List, type ListProps } from "react-window";
import { Copy, RotateCcw, Search, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  PendingDeleteRowSummary,
  PendingEditRowSummary,
} from "./grid-edit-summary";
import { formatGridCellValue } from "./grid-edit-summary";
import type {
  DbGridDeleteRowDraft,
  DbQueryBatchResult,
  DbQueryColumn,
  DbQueryRow,
  DbGridEditEligibility,
  DbGridEditPatchCell,
} from "@shared/schema";

type GridCellValue = string | number | boolean | null;

interface GridRowView {
  row: DbQueryRow;
  sourceIndex: number;
  rowPrimaryKey: Record<string, GridCellValue> | null;
  rowPkTuple: string | null;
  displayValues: GridCellValue[];
  dirtyColumnNames: Set<string>;
  isPendingDelete: boolean;
}

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface ResultGridPaneProps {
  /** 実行結果バッチ一覧（マルチステートメント対応） */
  batches: DbQueryBatchResult[];
  /** 現在表示しているバッチ index */
  activeIndex: number;
  /** バッチ切替コールバック */
  onActiveIndexChange: (index: number) => void;
  /** ロードモアボタン押下時のコールバック（batchIndex を渡す） */
  onLoadMore: (batchIndex: number) => void;
  /** クエリ実行中フラグ */
  isLoading: boolean;
  stopOnError: boolean;
  /** Stop on error 変更コールバック */
  onStopOnErrorChange: (value: boolean) => void;
  editEligibility?: DbGridEditEligibility;
  primaryKeyColumns?: string[];
  pendingEditCells: Record<string, DbGridEditPatchCell>;
  pendingEditRows: PendingEditRowSummary[];
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>;
  pendingDeletedRows: PendingDeleteRowSummary[];
  pendingEditCount: number;
  pendingDeleteCount: number;
  onEditCell: (patch: DbGridEditPatchCell) => void;
  onRevertCell: (rowPkTuple: string, columnName: string) => void;
  onRevertRow: (rowPkTuple: string) => void;
  onStageDeleteRow: (row: DbGridDeleteRowDraft) => void;
  onRevertDeleteRow: (rowPkTuple: string) => void;
  onPrepareCommit: () => void;
  onDiscardEdits: () => void;
}

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

function calcDefaultColumnWidth(col: DbQueryColumn): number {
  const nameLen = col.name.length;
  const typeLen = col.dataType?.length ?? 0;
  const estimated = Math.max(nameLen, typeLen) * 8 + 24;
  return Math.min(300, Math.max(60, estimated));
}

function formatCellValue(value: GridCellValue): string {
  return formatGridCellValue(value);
}

function valuesToObject(
  values: GridCellValue[],
  columns: DbQueryColumn[],
): Record<string, GridCellValue> {
  return Object.fromEntries(
    columns.map((column, index) => [column.name, values[index] ?? null]),
  );
}

function valuesToTsv(values: GridCellValue[], columns: DbQueryColumn[]): string {
  const header = columns.map((column) => column.name).join("\t");
  const rowValues = values.map((value) => formatCellValue(value)).join("\t");
  return `${header}\n${rowValues}`;
}

function buildRowPrimaryKey(
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

function buildRowPkTuple(
  rowPrimaryKey: Record<string, GridCellValue>,
  primaryKeyColumns: string[],
): string {
  return primaryKeyColumns
    .map((column) => `${column}=${formatCellValue(rowPrimaryKey[column] ?? null)}`)
    .join("|");
}

function parseEditedValue(
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

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "true");
  fallback.style.position = "absolute";
  fallback.style.left = "-9999px";
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

function buildPendingEditLookup(
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

function buildPendingDeleteLookup(
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>,
): Map<string, DbGridDeleteRowDraft> {
  return new Map(
    Object.values(pendingDeleteRows).map((row) => [row.rowPkTuple, row]),
  );
}

function buildGridRowView(
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
    row,
    sourceIndex,
    rowPrimaryKey,
    rowPkTuple,
    displayValues,
    dirtyColumnNames: new Set(pendingRowCells?.keys() ?? []),
    isPendingDelete: rowPkTuple ? pendingDeleteLookup.has(rowPkTuple) : false,
  };
}

// ──────────────────────────────────────────────
// バッチタブコンポーネント
// ──────────────────────────────────────────────

function BatchTabs({
  batches,
  activeIndex,
  onSelect,
}: {
  batches: DbQueryBatchResult[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  if (batches.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Statement results"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-panel-muted px-2 py-1"
    >
      {batches.map((batch, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === activeIndex}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => onSelect(index)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs transition-colors",
            index === activeIndex
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {batch.error ? <XCircle className="h-3 w-3 text-destructive" /> : null}
          <span>Statement {index + 1}</span>
          <span className="text-[10px] text-muted-foreground">
            {batch.elapsedMs}ms
          </span>
        </button>
      ))}
    </div>
  );
}

function ScriptRunSummary({
  batches,
  activeIndex,
  onSelect,
}: {
  batches: DbQueryBatchResult[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (batches.length <= 1) return null;

  const failedIndexes = batches
    .map((batch, index) => (batch.error ? index : -1))
    .filter((index) => index >= 0);
  const successCount = batches.length - failedIndexes.length;
  const firstFailedIndex = failedIndexes[0];
  const firstFailedBatch =
    typeof firstFailedIndex === "number" ? batches[firstFailedIndex] : null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            Script summary
          </span>
          <span className="text-muted-foreground">
            {batches.length} statements
          </span>
          <span className="text-emerald-700 dark:text-emerald-300">
            {successCount} succeeded
          </span>
          {failedIndexes.length > 0 ? (
            <span className="text-destructive">
              {failedIndexes.length} failed
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {firstFailedBatch
            ? `First failure: statement ${firstFailedIndex + 1} · ${firstFailedBatch.error}`
            : "All statements completed without statement-level failures."}
        </p>
      </div>
      {firstFailedBatch ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => onSelect(firstFailedIndex)}
          disabled={activeIndex === firstFailedIndex}
        >
          Jump to failed statement
        </Button>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────
// 選択行インスペクター
// ──────────────────────────────────────────────

function SelectedRowInspector({
  rowValues,
  rowPkTuple,
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
  onStageDeleteRow,
  onRevertDeleteRow,
}: {
  rowValues: GridCellValue[] | null;
  rowPkTuple: string | null;
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
  onStageDeleteRow: () => void;
  onRevertDeleteRow: () => void;
}) {
  const dirtyFieldCount = dirtyColumnNames?.size ?? 0;

  return (
    <div className="shrink-0 border-t border-border bg-background/95">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Row Inspector
          </p>
          <p className="mt-0.5 text-xs text-foreground">
            {rowValues && rowIndex !== null
              ? `Loaded row ${rowIndex.toLocaleString()} · inspect and copy field values${dirtyFieldCount > 0 ? ` · ${dirtyFieldCount} pending field${dirtyFieldCount > 1 ? "s" : ""}` : ""}${isPendingDelete ? " · pending delete" : ""}`
              : "Select a row to inspect fields, verify values, and continue from the result set."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onRevertRow}
            disabled={!rowPkTuple || dirtyFieldCount === 0}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Revert row
          </Button>
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
            const displayValue = formatCellValue(value);
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
                        : isDirty
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-border bg-muted/20",
                      value === null ? "italic text-muted-foreground" : "text-foreground",
                      isPendingDelete ? "line-through opacity-70" : undefined,
                    )}
                  >
                    {displayValue}
                  </div>
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
                  {isDirty && !isPendingDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-amber-700 hover:text-amber-800 dark:text-amber-300"
                      onClick={() => onRevertCell(column.name)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Revert
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

// ──────────────────────────────────────────────
// 単一バッチグリッド
// ──────────────────────────────────────────────

function SingleBatchGrid({
  batch,
  batchIndex,
  onLoadMore,
  editEligibility,
  primaryKeyColumns,
  pendingEditCells,
  pendingEditRows,
  pendingDeleteRows,
  pendingDeletedRows,
  pendingEditCount,
  pendingDeleteCount,
  onEditCell,
  onRevertCell,
  onRevertRow,
  onStageDeleteRow,
  onRevertDeleteRow,
  onPrepareCommit,
  onDiscardEdits,
}: {
  batch: DbQueryBatchResult;
  batchIndex: number;
  onLoadMore: (batchIndex: number) => void;
  editEligibility?: DbGridEditEligibility;
  primaryKeyColumns?: string[];
  pendingEditCells: Record<string, DbGridEditPatchCell>;
  pendingEditRows: PendingEditRowSummary[];
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>;
  pendingDeletedRows: PendingDeleteRowSummary[];
  pendingEditCount: number;
  pendingDeleteCount: number;
  onEditCell: (patch: DbGridEditPatchCell) => void;
  onRevertCell: (rowPkTuple: string, columnName: string) => void;
  onRevertRow: (rowPkTuple: string) => void;
  onStageDeleteRow: (row: DbGridDeleteRowDraft) => void;
  onRevertDeleteRow: (rowPkTuple: string) => void;
  onPrepareCommit: () => void;
  onDiscardEdits: () => void;
}) {
  const { toast } = useToast();

  const [columnWidths, setColumnWidths] = useState<number[]>(() =>
    batch.columns.map(calcDefaultColumnWidth),
  );
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [filterText, setFilterText] = useState("");
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    columnName: string;
  } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const dragState = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const primaryKeyList = useMemo(() => primaryKeyColumns ?? [], [primaryKeyColumns]);
  const primaryKeySet = useMemo(
    () => new Set(primaryKeyList),
    [primaryKeyList],
  );
  const isEditEnabled = editEligibility?.eligible === true;
  const pendingEditLookup = useMemo(
    () => buildPendingEditLookup(pendingEditCells),
    [pendingEditCells],
  );
  const pendingDeleteLookup = useMemo(
    () => buildPendingDeleteLookup(pendingDeleteRows),
    [pendingDeleteRows],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent, colIndex: number) => {
      event.preventDefault();
      dragState.current = {
        colIndex,
        startX: event.clientX,
        startWidth: columnWidths[colIndex],
      };

      const handleMouseMove = (mouseEvent: MouseEvent) => {
        if (!dragState.current) return;
        const delta = mouseEvent.clientX - dragState.current.startX;
        const nextWidth = Math.min(
          300,
          Math.max(60, dragState.current.startWidth + delta),
        );

        setColumnWidths((prev) => {
          const next = [...prev];
          next[dragState.current!.colIndex] = nextWidth;
          return next;
        });
      };

      const handleMouseUp = () => {
        dragState.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [columnWidths],
  );

  useEffect(() => {
    setColumnWidths(batch.columns.map(calcDefaultColumnWidth));
  }, [batch.columns]);

  useEffect(() => {
    setFilterText("");
    setSelectedRow(null);
    setEditingCell(null);
    setEditingValue("");
  }, [batch.sql]);

  const normalizedFilter = filterText.trim().toLowerCase();
  const rowViews = useMemo(
    () =>
      batch.rows.map((row, sourceIndex) =>
        buildGridRowView(
          row,
          (batch.loadedRowOffset ?? 0) + sourceIndex,
          batch.columns,
          primaryKeyList,
          pendingEditLookup,
          pendingDeleteLookup,
        ),
      ),
    [batch.columns, batch.loadedRowOffset, batch.rows, pendingDeleteLookup, pendingEditLookup, primaryKeyList],
  );
  const filteredRows = useMemo(() => {
    if (!normalizedFilter) return rowViews;
    return rowViews.filter((rowView) =>
      rowView.displayValues.some((value) =>
        formatCellValue(value).toLowerCase().includes(normalizedFilter),
      ),
    );
  }, [normalizedFilter, rowViews]);

  useEffect(() => {
    if (selectedRow === null) return;
    if (selectedRow < filteredRows.length) return;
    setSelectedRow(null);
  }, [filteredRows.length, selectedRow]);

  if (batch.error) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-destructive">Query failed</p>
        <p className="text-xs text-destructive">{batch.error}</p>
        <p className="text-xs text-muted-foreground">
          Edit your query and try again.
        </p>
      </div>
    );
  }

  if (batch.columns.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="text-xs text-muted-foreground">
          {batch.affectedRows ?? 0} rows affected ({batch.elapsedMs}ms)
        </span>
      </div>
    );
  }

  const selectedRowData = selectedRow === null ? null : filteredRows[selectedRow] ?? null;
  const selectedLoadedIndex =
    selectedRowData === null ? null : selectedRowData.sourceIndex + 1;

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const loadedCount =
    typeof batch.loadedRowCount === "number"
      ? Math.max(batch.rows.length, Math.trunc(batch.loadedRowCount))
      : Math.max(batch.rows.length, batch.returnedRows || 0);
  const retainedCount = batch.rows.length;
  const isRowWindowTruncated = batch.rowWindowTruncated === true;
  const totalRows = typeof batch.totalRows === "number" ? batch.totalRows : null;
  const totalLabel = totalRows === null ? "Unknown total" : `${totalRows.toLocaleString()} total`;
  const hasMore = batch.hasMore;
  const loadMoreCount =
    totalRows !== null && typeof batch.nextOffset === "number"
      ? Math.max(1, Math.min(1000, Math.max(0, totalRows - batch.nextOffset)))
      : 1000;
  const pagingMode = batch.pagingMode;
  const canLoadMore = pagingMode === "offset" && hasMore;
  const isPagingUnsupported = pagingMode === "unsupported";
  const unsupportedPagingText = "Load more unavailable for this result.";
  const filteredCount = filteredRows.length;
  const footerStatusLabel = isRowWindowTruncated
    ? `${filteredCount.toLocaleString()} shown / ${retainedCount.toLocaleString()} retained / ${loadedCount.toLocaleString()} loaded / ${totalLabel}`
    : `${filteredCount.toLocaleString()} shown / ${loadedCount.toLocaleString()} loaded / ${totalLabel}`;
  const pendingSummaryRows = pendingEditRows.slice(0, 4);
  const pendingDeleteSummaryRows = pendingDeletedRows.slice(0, 4);
  const pendingMutationCount = pendingEditCount + pendingDeleteCount;

  const headerHeight = 28;
  const filterBarHeight = 42;
  const statusHeight = 36;
  const inspectorHeight = 177;
  const inspectorOffset = selectedRowData ? inspectorHeight : 49;
  const gridHeight = Math.max(
    64,
    containerSize.height - headerHeight - filterBarHeight - statusHeight - inspectorOffset,
  );

  const copyText = useCallback(
    async (text: string, successTitle: string) => {
      try {
        await writeClipboardText(text);
        toast({ title: successTitle, variant: "success" });
      } catch (error) {
        toast({
          title: "复制失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleCopyRowJson = useCallback(() => {
    if (!selectedRowData) return;
    const json = JSON.stringify(
      valuesToObject(selectedRowData.displayValues, batch.columns),
      null,
      2,
    );
    void copyText(json, "已复制当前行 JSON");
  }, [batch.columns, copyText, selectedRowData]);

  const handleCopyRowTsv = useCallback(() => {
    if (!selectedRowData) return;
    void copyText(valuesToTsv(selectedRowData.displayValues, batch.columns), "已复制当前行 TSV");
  }, [batch.columns, copyText, selectedRowData]);

  const handleCopyCell = useCallback(
    (column: DbQueryColumn, value: GridCellValue) => {
      void copyText(formatCellValue(value), `已复制 ${column.name}`);
    },
    [copyText],
  );
  const handleRevertSelectedCell = useCallback(
    (columnName: string) => {
      if (!selectedRowData?.rowPkTuple) return;
      setEditingCell(null);
      setEditingValue("");
      onRevertCell(selectedRowData.rowPkTuple, columnName);
    },
    [onRevertCell, selectedRowData],
  );
  const handleRevertSelectedRow = useCallback(() => {
    if (!selectedRowData?.rowPkTuple) return;
    setEditingCell(null);
    setEditingValue("");
    onRevertRow(selectedRowData.rowPkTuple);
  }, [onRevertRow, selectedRowData]);
  const handleStageDeleteSelectedRow = useCallback(() => {
    if (!selectedRowData?.rowPkTuple || !selectedRowData.rowPrimaryKey) return;
    setEditingCell(null);
    setEditingValue("");
    onStageDeleteRow({
      rowPkTuple: selectedRowData.rowPkTuple,
      rowPrimaryKey: selectedRowData.rowPrimaryKey,
    });
  }, [onStageDeleteRow, selectedRowData]);
  const handleRevertSelectedDelete = useCallback(() => {
    if (!selectedRowData?.rowPkTuple) return;
    setEditingCell(null);
    setEditingValue("");
    onRevertDeleteRow(selectedRowData.rowPkTuple);
  }, [onRevertDeleteRow, selectedRowData]);

  const commitEdit = useCallback(
    (
      rowView: GridRowView,
      rowIndex: number,
      column: DbQueryColumn,
      columnIndex: number,
      nextRawValue: string,
    ) => {
      if (!isEditEnabled) {
        setEditingCell(null);
        setEditingValue("");
        return;
      }
      if (rowView.isPendingDelete) {
        setEditingCell(null);
        setEditingValue("");
        return;
      }
      if (primaryKeySet.has(column.name)) {
        setEditingCell(null);
        setEditingValue("");
        return;
      }

      if (!rowView.rowPrimaryKey || !rowView.rowPkTuple) {
        toast({
          title: "Cannot edit row",
          description: "Primary key column mapping is incomplete for this batch.",
          variant: "destructive",
        });
        setEditingCell(null);
        setEditingValue("");
        return;
      }

      const existingPatch = pendingEditLookup
        .get(rowView.rowPkTuple)
        ?.get(column.name);
      const beforeValue = existingPatch?.beforeValue ?? rowView.row.values[columnIndex] ?? null;
      const nextValue = parseEditedValue(beforeValue, nextRawValue);

      onEditCell({
        rowPrimaryKey: rowView.rowPrimaryKey,
        rowPkTuple: rowView.rowPkTuple,
        columnName: column.name,
        beforeValue,
        nextValue,
      });

      setSelectedRow(rowIndex);
      setEditingCell(null);
      setEditingValue("");
    },
    [isEditEnabled, onEditCell, pendingEditLookup, primaryKeySet, toast],
  );

  const startEdit = useCallback(
    (rowView: GridRowView, rowIndex: number, column: DbQueryColumn, columnIndex: number) => {
      if (!isEditEnabled || primaryKeySet.has(column.name) || rowView.isPendingDelete) {
        return;
      }
      setEditingCell({
        rowIndex,
        columnName: column.name,
      });
      setEditingValue(formatCellValue(rowView.displayValues[columnIndex] ?? null));
    },
    [isEditEnabled, primaryKeySet],
  );

  const RowRenderer: ListProps<Record<string, never>>["rowComponent"] = ({
    index,
    style,
  }) => {
    const rowView = filteredRows[index];
    const isSelected = selectedRow === index;
    const hasDirtyCells = rowView.dirtyColumnNames.size > 0;
    const isPendingDelete = rowView.isPendingDelete;

    return (
      <div
        style={style}
        role="row"
        aria-selected={isSelected}
        className={cn(
          "flex cursor-pointer items-center border-b border-border",
          isSelected
            ? isPendingDelete
              ? "bg-destructive/10"
              : "bg-primary/10"
            : isPendingDelete
              ? "bg-destructive/5 hover:bg-destructive/10"
              : hasDirtyCells
              ? "bg-amber-500/5 hover:bg-amber-500/10"
              : "hover:bg-muted/40",
        )}
        onClick={() => setSelectedRow(index)}
      >
        {batch.columns.map((column, columnIndex) => {
          const value = rowView.displayValues[columnIndex] ?? null;
          const displayValue = formatCellValue(value);
          const isNull = value === null;
          const isPrimaryKeyColumn = primaryKeySet.has(column.name);
          const isDirty = rowView.dirtyColumnNames.has(column.name);
          const isCellEditing =
            editingCell?.rowIndex === index &&
            editingCell.columnName === column.name;
          const canEditCell = isEditEnabled && !isPrimaryKeyColumn && !isPendingDelete;

          return (
            <TooltipProvider key={`${column.name}:${columnIndex}`} delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "shrink-0 overflow-hidden border-r border-border px-2",
                      isPendingDelete && !isCellEditing ? "bg-destructive/5" : undefined,
                      isDirty && !isCellEditing ? "bg-amber-500/10" : undefined,
                    )}
                    style={{ width: columnWidths[columnIndex], height: 32 }}
                    onDoubleClick={() => startEdit(rowView, index, column, columnIndex)}
                  >
                    {isCellEditing ? (
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() =>
                          commitEdit(rowView, index, column, columnIndex, editingValue)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitEdit(rowView, index, column, columnIndex, editingValue);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingCell(null);
                            setEditingValue("");
                          }
                        }}
                        className="mt-[3px] h-6 w-full rounded-sm border border-border bg-background px-1 text-xs font-mono text-foreground outline-none"
                      />
                    ) : (
                      <span
                        className={cn(
                          "block truncate text-xs font-mono leading-8",
                          isNull ? "italic text-muted-foreground" : "text-foreground",
                          canEditCell ? "cursor-text" : undefined,
                          isPrimaryKeyColumn ? "text-muted-foreground" : undefined,
                          isPendingDelete ? "line-through opacity-70" : undefined,
                          isDirty ? "font-semibold text-amber-900 dark:text-amber-100" : undefined,
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
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={isRowWindowTruncated ? "Filter retained rows" : "Filter loaded rows"}
            className="h-7 pl-7 pr-7 text-xs"
          />
          {filterText ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setFilterText("")}
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
          <span>{filteredCount.toLocaleString()} shown</span>
          <span>{loadedCount.toLocaleString()} loaded</span>
          {isRowWindowTruncated ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              Retaining latest {retainedCount.toLocaleString()} rows
            </span>
          ) : null}
          <span>{totalLabel}</span>
          {selectedLoadedIndex ? (
            <span className="font-medium text-foreground">
              Row {selectedLoadedIndex.toLocaleString()} selected
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="flex shrink-0 overflow-hidden border-b border-border bg-panel-muted"
        style={{ height: headerHeight, minWidth: totalWidth }}
      >
        {batch.columns.map((column, columnIndex) => (
          <div
            key={`${column.name}:${columnIndex}`}
            className="relative shrink-0 border-r border-border px-2"
            style={{ width: columnWidths[columnIndex], height: headerHeight }}
          >
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block truncate text-xs font-semibold leading-7 text-foreground">
                    {column.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {column.name} — {column.dataType}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div
              className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/50"
              onMouseDown={(event) => handleResizeMouseDown(event, columnIndex)}
            />
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {batch.rows.length === 0
                  ? "This query returned no rows."
                  : "No loaded rows match the current filter."}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {batch.rows.length === 0
                  ? "Try another statement or inspect a different table."
                  : "Clear or refine the filter to continue browsing the current result set."}
              </p>
            </div>
          </div>
        ) : containerSize.height > 0 ? (
          <List<Record<string, never>>
            rowCount={filteredRows.length}
            rowHeight={32}
            rowComponent={RowRenderer}
            rowProps={{}}
            defaultHeight={gridHeight}
            style={{ width: Math.max(totalWidth, containerSize.width) }}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-panel-muted px-3 py-1">
        {canLoadMore ? (
          <>
            <span className="text-xs text-muted-foreground">
              {footerStatusLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onLoadMore(batchIndex)}
            >
              Load {loadMoreCount.toLocaleString()} more rows
            </Button>
          </>
        ) : isPagingUnsupported ? (
          <span className="text-xs text-muted-foreground">
            {footerStatusLabel}. {unsupportedPagingText}
          </span>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {filteredCount.toLocaleString()} shown / {loadedCount.toLocaleString()} loaded ({batch.elapsedMs}ms)
            </span>
            {isRowWindowTruncated ? (
              <span>Older loaded rows were released to control memory.</span>
            ) : null}
          </div>
        )}
      </div>

      {pendingEditRows.length > 0 || pendingDeletedRows.length > 0 ? (
        <div className="shrink-0 border-t border-border bg-background px-3 py-2">
          {pendingEditRows.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Pending row summary
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pendingEditRows.length} row{pendingEditRows.length > 1 ? "s" : ""} staged
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {pendingSummaryRows.map((row) => (
                  <div
                    key={`pending-row-${row.rowPkTuple}`}
                    className="flex items-center justify-between gap-3 rounded-sm border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-medium text-foreground">
                        {row.rowKeyLabel}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {row.cells.map((cell) => cell.columnName).join(", ")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onRevertRow(row.rowPkTuple)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Revert row
                    </Button>
                  </div>
                ))}
                {pendingEditRows.length > pendingSummaryRows.length ? (
                  <p className="text-[10px] text-muted-foreground">
                    +{pendingEditRows.length - pendingSummaryRows.length} more row
                    {pendingEditRows.length - pendingSummaryRows.length > 1 ? "s" : ""} in commit preview
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {pendingDeletedRows.length > 0 ? (
            <div className={cn(pendingEditRows.length > 0 ? "mt-3" : undefined)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive">
                  Pending row deletes
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pendingDeletedRows.length} row{pendingDeletedRows.length > 1 ? "s" : ""} staged
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {pendingDeleteSummaryRows.map((row) => (
                  <div
                    key={`pending-delete-${row.rowPkTuple}`}
                    className="flex items-center justify-between gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-2 py-1.5"
                  >
                    <p className="truncate font-mono text-[11px] font-medium text-foreground">
                      {row.rowKeyLabel}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-destructive"
                      onClick={() => onRevertDeleteRow(row.rowPkTuple)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Revert delete
                    </Button>
                  </div>
                ))}
                {pendingDeletedRows.length > pendingDeleteSummaryRows.length ? (
                  <p className="text-[10px] text-muted-foreground">
                    +{pendingDeletedRows.length - pendingDeleteSummaryRows.length} more row
                    {pendingDeletedRows.length - pendingDeleteSummaryRows.length > 1 ? "s" : ""} in commit preview
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1">
        <span className="text-xs text-muted-foreground">
          Pending changes: {pendingEditCount} edited cell{pendingEditCount === 1 ? "" : "s"} across {pendingEditRows.length} row{pendingEditRows.length === 1 ? "" : "s"} · {pendingDeleteCount} delete{pendingDeleteCount === 1 ? "" : "s"}
        </span>
        {pendingEditCount > 0 ? (
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
            Dirty cells highlighted
          </span>
        ) : null}
        {pendingDeleteCount > 0 ? (
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-destructive">
            Delete-staged rows highlighted
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onPrepareCommit}
          disabled={!isEditEnabled || pendingMutationCount === 0}
        >
          Prepare commit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onDiscardEdits}
          disabled={pendingMutationCount === 0}
        >
          Discard edits
        </Button>
      </div>

      <SelectedRowInspector
        rowValues={selectedRowData?.displayValues ?? null}
        rowPkTuple={selectedRowData?.rowPkTuple ?? null}
        dirtyColumnNames={selectedRowData?.dirtyColumnNames}
        isPendingDelete={selectedRowData?.isPendingDelete ?? false}
        columns={batch.columns}
        rowIndex={selectedLoadedIndex}
        canStageDelete={isEditEnabled}
        onCopyRowJson={handleCopyRowJson}
        onCopyRowTsv={handleCopyRowTsv}
        onCopyCell={handleCopyCell}
        onRevertCell={handleRevertSelectedCell}
        onRevertRow={handleRevertSelectedRow}
        onStageDeleteRow={handleStageDeleteSelectedRow}
        onRevertDeleteRow={handleRevertSelectedDelete}
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * ResultGridPane — クエリ結果グリッドパネル
 *
 * マルチバッチタブ + 仮想スクロールグリッド + ロードモア + Stop on error トグル
 */
export function ResultGridPane({
  batches,
  activeIndex,
  onActiveIndexChange,
  onLoadMore,
  isLoading,
  stopOnError,
  onStopOnErrorChange,
  editEligibility,
  primaryKeyColumns,
  pendingEditCells,
  pendingEditRows,
  pendingDeleteRows,
  pendingDeletedRows,
  pendingEditCount,
  pendingDeleteCount,
  onEditCell,
  onRevertCell,
  onRevertRow,
  onStageDeleteRow,
  onRevertDeleteRow,
  onPrepareCommit,
  onDiscardEdits,
}: ResultGridPaneProps) {
  useEffect(() => {
    if (activeIndex >= batches.length && batches.length > 0) {
      onActiveIndexChange(batches.length - 1);
    }
  }, [batches.length, activeIndex, onActiveIndexChange]);

  const handleStopOnErrorChange = (value: boolean) => {
    onStopOnErrorChange(value);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">Running...</span>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              Run a query to see results here.
            </p>
            <p className="text-[10px] text-muted-foreground">
              Result batches, row inspection, load more, and export actions stay attached to the
              active statement in this connection-scoped session.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel-muted px-3 py-1">
          <Switch
            id="stop-on-error-empty"
            checked={stopOnError}
            onCheckedChange={handleStopOnErrorChange}
          />
          <Label htmlFor="stop-on-error-empty" className="cursor-pointer text-xs">
            Stop on error
          </Label>
        </div>
      </div>
    );
  }

  const activeBatch = batches[Math.min(activeIndex, batches.length - 1)];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScriptRunSummary
        batches={batches}
        activeIndex={activeIndex}
        onSelect={onActiveIndexChange}
      />

      <BatchTabs
        batches={batches}
        activeIndex={activeIndex}
        onSelect={onActiveIndexChange}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <SingleBatchGrid
          batch={activeBatch}
          batchIndex={activeIndex}
          onLoadMore={onLoadMore}
          editEligibility={editEligibility}
          primaryKeyColumns={primaryKeyColumns}
          pendingEditCells={pendingEditCells}
          pendingEditRows={pendingEditRows}
          pendingDeleteRows={pendingDeleteRows}
          pendingDeletedRows={pendingDeletedRows}
          pendingEditCount={pendingEditCount}
          pendingDeleteCount={pendingDeleteCount}
          onEditCell={onEditCell}
          onRevertCell={onRevertCell}
          onRevertRow={onRevertRow}
          onStageDeleteRow={onStageDeleteRow}
          onRevertDeleteRow={onRevertDeleteRow}
          onPrepareCommit={onPrepareCommit}
          onDiscardEdits={onDiscardEdits}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel-muted px-3 py-1">
        <Switch
          id="stop-on-error"
          checked={stopOnError}
          onCheckedChange={handleStopOnErrorChange}
        />
        <Label htmlFor="stop-on-error" className="cursor-pointer text-xs">
          Stop on error
        </Label>
      </div>
    </div>
  );
}
