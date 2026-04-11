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
import { Copy, Search, X, XCircle } from "lucide-react";
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
  DbQueryBatchResult,
  DbQueryColumn,
  DbQueryRow,
  DbGridEditEligibility,
  DbGridEditPatchCell,
} from "@shared/schema";

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
  pendingEditCount: number;
  onEditCell: (patch: DbGridEditPatchCell) => void;
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

function formatCellValue(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function rowToObject(
  row: DbQueryRow,
  columns: DbQueryColumn[],
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    columns.map((column, index) => [column.name, row.values[index] ?? null]),
  );
}

function rowToTsv(row: DbQueryRow, columns: DbQueryColumn[]): string {
  const header = columns.map((column) => column.name).join("\t");
  const values = row.values.map((value) => formatCellValue(value)).join("\t");
  return `${header}\n${values}`;
}

function buildRowPrimaryKey(
  row: DbQueryRow,
  columns: DbQueryColumn[],
  primaryKeyColumns: string[],
): Record<string, string | number | boolean | null> | null {
  const rowPrimaryKey: Record<string, string | number | boolean | null> = {};
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
  rowPrimaryKey: Record<string, string | number | boolean | null>,
  primaryKeyColumns: string[],
): string {
  return primaryKeyColumns
    .map((column) => `${column}=${formatCellValue(rowPrimaryKey[column] ?? null)}`)
    .join("|");
}

function parseEditedValue(
  originalValue: string | number | boolean | null,
  editedRawValue: string,
): string | number | boolean | null {
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

// ──────────────────────────────────────────────
// 選択行インスペクター
// ──────────────────────────────────────────────

function SelectedRowInspector({
  row,
  columns,
  rowIndex,
  onCopyRowJson,
  onCopyRowTsv,
  onCopyCell,
}: {
  row: DbQueryRow | null;
  columns: DbQueryColumn[];
  rowIndex: number | null;
  onCopyRowJson: () => void;
  onCopyRowTsv: () => void;
  onCopyCell: (column: DbQueryColumn, value: string | number | boolean | null) => void;
}) {
  return (
    <div className="shrink-0 border-t border-border bg-background/95">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Row Inspector
          </p>
          <p className="mt-0.5 text-xs text-foreground">
            {row && rowIndex !== null
              ? `Loaded row ${rowIndex.toLocaleString()} · inspect and copy field values`
              : "Select a row to inspect fields, verify values, and continue from the result set."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onCopyRowJson}
            disabled={!row}
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onCopyRowTsv}
            disabled={!row}
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy TSV
          </Button>
        </div>
      </div>

      {row ? (
        <div className="max-h-44 overflow-auto border-t border-border">
          {columns.map((column, index) => {
            const value = row.values[index] ?? null;
            const displayValue = formatCellValue(value);
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
                      "break-all rounded-sm border border-border bg-muted/20 px-2 py-1 font-mono text-[11px]",
                      value === null ? "italic text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {displayValue}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onCopyCell(column, value)}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </Button>
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
  pendingEditCount,
  onEditCell,
  onPrepareCommit,
  onDiscardEdits,
}: {
  batch: DbQueryBatchResult;
  batchIndex: number;
  onLoadMore: (batchIndex: number) => void;
  editEligibility?: DbGridEditEligibility;
  primaryKeyColumns?: string[];
  pendingEditCount: number;
  onEditCell: (patch: DbGridEditPatchCell) => void;
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
  const primaryKeyList = primaryKeyColumns ?? [];
  const primaryKeySet = useMemo(
    () => new Set(primaryKeyList),
    [primaryKeyList],
  );
  const isEditEnabled = editEligibility?.eligible === true;

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
  const filteredRows = useMemo(() => {
    if (!normalizedFilter) return batch.rows;
    return batch.rows.filter((row) =>
      row.values.some((value) =>
        formatCellValue(value).toLowerCase().includes(normalizedFilter),
      ),
    );
  }, [batch.rows, normalizedFilter]);

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
    selectedRowData === null ? null : batch.rows.indexOf(selectedRowData) + 1;

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const loadedCount = Math.max(batch.rows.length, batch.returnedRows || 0);
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
  const footerStatusLabel = `${filteredCount.toLocaleString()} shown / ${loadedCount.toLocaleString()} loaded / ${totalLabel}`;

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
    const json = JSON.stringify(rowToObject(selectedRowData, batch.columns), null, 2);
    void copyText(json, "已复制当前行 JSON");
  }, [batch.columns, copyText, selectedRowData]);

  const handleCopyRowTsv = useCallback(() => {
    if (!selectedRowData) return;
    void copyText(rowToTsv(selectedRowData, batch.columns), "已复制当前行 TSV");
  }, [batch.columns, copyText, selectedRowData]);

  const handleCopyCell = useCallback(
    (column: DbQueryColumn, value: string | number | boolean | null) => {
      void copyText(formatCellValue(value), `已复制 ${column.name}`);
    },
    [copyText],
  );

  const commitEdit = useCallback(
    (
      row: DbQueryRow,
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
      if (primaryKeySet.has(column.name)) {
        setEditingCell(null);
        setEditingValue("");
        return;
      }

      const rowPrimaryKey = buildRowPrimaryKey(row, batch.columns, primaryKeyList);
      if (!rowPrimaryKey) {
        toast({
          title: "Cannot edit row",
          description: "Primary key column mapping is incomplete for this batch.",
          variant: "destructive",
        });
        setEditingCell(null);
        setEditingValue("");
        return;
      }

      const beforeValue = row.values[columnIndex] ?? null;
      const nextValue = parseEditedValue(beforeValue, nextRawValue);

      onEditCell({
        rowPrimaryKey,
        rowPkTuple: buildRowPkTuple(rowPrimaryKey, primaryKeyList),
        columnName: column.name,
        beforeValue,
        nextValue,
      });

      setSelectedRow(rowIndex);
      setEditingCell(null);
      setEditingValue("");
    },
    [batch.columns, isEditEnabled, onEditCell, primaryKeyList, primaryKeySet, toast],
  );

  const startEdit = useCallback(
    (row: DbQueryRow, rowIndex: number, column: DbQueryColumn, columnIndex: number) => {
      if (!isEditEnabled || primaryKeySet.has(column.name)) {
        return;
      }
      setEditingCell({
        rowIndex,
        columnName: column.name,
      });
      setEditingValue(formatCellValue(row.values[columnIndex] ?? null));
    },
    [isEditEnabled, primaryKeySet],
  );

  const RowRenderer: ListProps<Record<string, never>>["rowComponent"] = ({
    index,
    style,
  }) => {
    const row = filteredRows[index];
    const isSelected = selectedRow === index;

    return (
      <div
        style={style}
        role="row"
        aria-selected={isSelected}
        className={cn(
          "flex cursor-pointer items-center border-b border-border",
          isSelected ? "bg-primary/10" : "hover:bg-muted/40",
        )}
        onClick={() => setSelectedRow(index)}
      >
        {batch.columns.map((column, columnIndex) => {
          const value = row.values[columnIndex] ?? null;
          const displayValue = formatCellValue(value);
          const isNull = value === null;
          const isPrimaryKeyColumn = primaryKeySet.has(column.name);
          const isCellEditing =
            editingCell?.rowIndex === index &&
            editingCell.columnName === column.name;
          const canEditCell = isEditEnabled && !isPrimaryKeyColumn;

          return (
            <TooltipProvider key={`${column.name}:${columnIndex}`} delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="shrink-0 overflow-hidden border-r border-border px-2"
                    style={{ width: columnWidths[columnIndex], height: 32 }}
                    onDoubleClick={() => startEdit(row, index, column, columnIndex)}
                  >
                    {isCellEditing ? (
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() =>
                          commitEdit(row, index, column, columnIndex, editingValue)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitEdit(row, index, column, columnIndex, editingValue);
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
            placeholder="Filter loaded rows"
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
          <span className="text-xs text-muted-foreground">
            {filteredCount.toLocaleString()} shown / {loadedCount.toLocaleString()} loaded ({batch.elapsedMs}ms)
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1">
        <span className="text-xs text-muted-foreground">
          Pending edits: {pendingEditCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onPrepareCommit}
          disabled={!isEditEnabled || pendingEditCount === 0}
        >
          Prepare commit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onDiscardEdits}
          disabled={pendingEditCount === 0}
        >
          Discard edits
        </Button>
      </div>

      <SelectedRowInspector
        row={selectedRowData}
        columns={batch.columns}
        rowIndex={selectedLoadedIndex}
        onCopyRowJson={handleCopyRowJson}
        onCopyRowTsv={handleCopyRowTsv}
        onCopyCell={handleCopyCell}
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
  pendingEditCount,
  onEditCell,
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
              Result batches, row inspection, and export actions will stay attached to the active statement.
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
          pendingEditCount={pendingEditCount}
          onEditCell={onEditCell}
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
