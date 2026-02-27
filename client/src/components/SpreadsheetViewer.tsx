import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useSheetData, useParseRegion } from "@/hooks/use-ddl";
import { Loader2, Grid3X3, MousePointerSquareDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { translateApiError } from "@/lib/api-error";
import type { TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";

type CellCoord = { row: number; col: number };
type SelectionRange = { start: CellCoord; end: CellCoord };

interface SpreadsheetViewerProps {
  fileId: number | null;
  sheetName: string | null;
  onRegionParsed?: (tables: TableInfo[]) => void;
}

const ROW_NUMBER_COL_WIDTH = 42;
const DATA_COL_WIDTH = 120;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 28;
const VIRTUAL_OVERSCAN_ROWS = 16;

function colToLetter(c: number): string {
  let s = "";
  let n = c;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function rangeLabel(sel: SelectionRange): string {
  const r0 = Math.min(sel.start.row, sel.end.row);
  const r1 = Math.max(sel.start.row, sel.end.row);
  const c0 = Math.min(sel.start.col, sel.end.col);
  const c1 = Math.max(sel.start.col, sel.end.col);
  return `${colToLetter(c0)}${r0 + 1}:${colToLetter(c1)}${r1 + 1}`;
}

function getSelectionRect(selection: SelectionRange | null) {
  if (!selection) {
    return null;
  }
  const r0 = Math.min(selection.start.row, selection.end.row);
  const r1 = Math.max(selection.start.row, selection.end.row);
  const c0 = Math.min(selection.start.col, selection.end.col);
  const c1 = Math.max(selection.start.col, selection.end.col);

  return {
    left: ROW_NUMBER_COL_WIDTH + c0 * DATA_COL_WIDTH,
    top: HEADER_HEIGHT + r0 * ROW_HEIGHT,
    width: Math.max(1, (c1 - c0 + 1) * DATA_COL_WIDTH),
    height: Math.max(1, (r1 - r0 + 1) * ROW_HEIGHT),
  };
}

interface SpreadsheetGridProps {
  maxCols: number;
  rowStart: number;
  rowEnd: number;
  sheetData: any[][];
  onCellMouseDown: (row: number, col: number, event: ReactMouseEvent<HTMLTableCellElement>) => void;
  onCellMouseEnter: (row: number, col: number, event: ReactMouseEvent<HTMLTableCellElement>) => void;
}

const SpreadsheetGrid = memo(function SpreadsheetGrid({
  maxCols,
  rowStart,
  rowEnd,
  sheetData,
  onCellMouseDown,
  onCellMouseEnter,
}: SpreadsheetGridProps) {
  const totalRows = sheetData.length;
  const safeRowStart = Math.max(0, Math.min(rowStart, Math.max(0, totalRows - 1)));
  const safeRowEnd = Math.max(safeRowStart - 1, Math.min(rowEnd, Math.max(0, totalRows - 1)));
  const hasRows = safeRowEnd >= safeRowStart;
  const topSpacerHeight = safeRowStart * ROW_HEIGHT;
  const bottomSpacerHeight = hasRows ? (totalRows - safeRowEnd - 1) * ROW_HEIGHT : totalRows * ROW_HEIGHT;

  return (
    <table className="border-collapse text-[11px] font-mono" style={{ minWidth: "100%", tableLayout: "fixed" }}>
      <thead className="sticky top-0 z-10">
        <tr>
          <th
            className="sticky left-0 z-20 bg-muted border-r border-b border-border text-center text-[10px] text-muted-foreground font-medium"
            style={{
              width: ROW_NUMBER_COL_WIDTH,
              minWidth: ROW_NUMBER_COL_WIDTH,
              maxWidth: ROW_NUMBER_COL_WIDTH,
              height: HEADER_HEIGHT,
            }}
          />
          {Array.from({ length: maxCols }, (_, c) => (
            <th
              key={c}
              className="bg-muted border-r border-b border-border px-1.5 py-1 text-center text-[10px] text-muted-foreground font-medium overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                width: DATA_COL_WIDTH,
                minWidth: DATA_COL_WIDTH,
                maxWidth: DATA_COL_WIDTH,
                height: HEADER_HEIGHT,
              }}
            >
              {colToLetter(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {topSpacerHeight > 0 && (
          <tr aria-hidden="true">
            <td colSpan={maxCols + 1} className="border-0 p-0" style={{ height: topSpacerHeight }} />
          </tr>
        )}

        {hasRows &&
          Array.from({ length: safeRowEnd - safeRowStart + 1 }, (_, offset) => {
            const r = safeRowStart + offset;
            const row = sheetData[r];
            return (
              <tr key={r} style={{ height: ROW_HEIGHT }}>
                <td
                  className="sticky left-0 z-[1] bg-muted border-r border-b border-border px-1.5 py-0 text-center text-[10px] text-muted-foreground font-medium"
                  style={{
                    width: ROW_NUMBER_COL_WIDTH,
                    minWidth: ROW_NUMBER_COL_WIDTH,
                    maxWidth: ROW_NUMBER_COL_WIDTH,
                    height: ROW_HEIGHT,
                  }}
                >
                  {r + 1}
                </td>
                {Array.from({ length: maxCols }, (_, c) => {
                  const val = row?.[c];
                  const hasValue = val !== null && val !== undefined && String(val).trim() !== "";

                  return (
                    <td
                      key={c}
                      onMouseDown={(event) => onCellMouseDown(r, c, event)}
                      onMouseEnter={(event) => onCellMouseEnter(r, c, event)}
                      className={cn(
                        "border-r border-b border-border px-1.5 py-0 cursor-cell overflow-hidden text-ellipsis whitespace-nowrap",
                        r % 2 === 0 ? "bg-background" : "bg-muted/20",
                        hasValue ? "text-foreground" : "text-transparent",
                      )}
                      style={{
                        width: DATA_COL_WIDTH,
                        minWidth: DATA_COL_WIDTH,
                        maxWidth: DATA_COL_WIDTH,
                        height: ROW_HEIGHT,
                        lineHeight: `${ROW_HEIGHT - 2}px`,
                      }}
                      title={hasValue ? String(val) : ""}
                    >
                      {hasValue ? String(val) : "\u00A0"}
                    </td>
                  );
                })}
              </tr>
            );
          })}

        {bottomSpacerHeight > 0 && (
          <tr aria-hidden="true">
            <td colSpan={maxCols + 1} className="border-0 p-0" style={{ height: bottomSpacerHeight }} />
          </tr>
        )}
      </tbody>
    </table>
  );
});

export function SpreadsheetViewer({ fileId, sheetName, onRegionParsed }: SpreadsheetViewerProps) {
  const { data: sheetData, isLoading, error } = useSheetData(fileId, sheetName);
  const { mutate: parseRegion, isPending: isParsing } = useParseRegion();
  const { t } = useTranslation();
  const translatedError = useMemo(
    () => (error ? translateApiError(error, t, { includeIssues: false }) : null),
    [error, t],
  );

  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const selectionRef = useRef<SelectionRange | null>(null);
  const dragStartRef = useRef<CellCoord | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const selectionRafRef = useRef<number | null>(null);

  // Reset state when sheet changes.
  useEffect(() => {
    setSelection(null);
    setIsDragging(false);
    setScrollTop(0);
    isDraggingRef.current = false;
    selectionRef.current = null;
    dragStartRef.current = null;
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    if (selectionRafRef.current != null) {
      cancelAnimationFrame(selectionRafRef.current);
      selectionRafRef.current = null;
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [fileId, sheetName]);

  const maxCols = useMemo(() => {
    if (!sheetData) return 0;
    let max = 0;
    sheetData.forEach((row) => {
      if (row && row.length > max) max = row.length;
    });
    return Math.max(max, 5);
  }, [sheetData]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }

    const measure = () => {
      setViewportHeight(node.clientHeight);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sheetData, maxCols]);

  const handleScroll = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    if (scrollRafRef.current != null) {
      return;
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(node.scrollTop);
    });
  }, []);

  const scheduleSelectionPreviewUpdate = useCallback(() => {
    if (selectionRafRef.current != null) {
      return;
    }
    selectionRafRef.current = requestAnimationFrame(() => {
      selectionRafRef.current = null;
      if (selectionRef.current) {
        setSelection(selectionRef.current);
      }
    });
  }, []);

  const handleMouseDown = useCallback((r: number, c: number, event: ReactMouseEvent<HTMLTableCellElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const nextSelection: SelectionRange = { start: { row: r, col: c }, end: { row: r, col: c } };
    isDraggingRef.current = true;
    dragStartRef.current = { row: r, col: c };
    selectionRef.current = nextSelection;
    setIsDragging(true);
    setSelection(nextSelection);
  }, []);

  const handleMouseEnter = useCallback(
    (r: number, c: number) => {
      if (!isDraggingRef.current || !dragStartRef.current) {
        return;
      }
      const current = selectionRef.current?.end;
      if (current && current.row === r && current.col === c) {
        return;
      }
      selectionRef.current = { start: dragStartRef.current, end: { row: r, col: c } };
      scheduleSelectionPreviewUpdate();
    },
    [scheduleSelectionPreviewUpdate],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) {
      return;
    }
    isDraggingRef.current = false;
    setIsDragging(false);
    if (selectionRafRef.current != null) {
      cancelAnimationFrame(selectionRafRef.current);
      selectionRafRef.current = null;
    }

    const finalSelection = selectionRef.current;
    if (!finalSelection || !fileId || !sheetName) {
      return;
    }
    setSelection(finalSelection);

    const r0 = Math.min(finalSelection.start.row, finalSelection.end.row);
    const r1 = Math.max(finalSelection.start.row, finalSelection.end.row);
    const c0 = Math.min(finalSelection.start.col, finalSelection.end.col);
    const c1 = Math.max(finalSelection.start.col, finalSelection.end.col);

    // Only parse if selection is meaningful (at least 2 rows).
    if (r1 - r0 < 1) return;

    parseRegion(
      { fileId, sheetName, startRow: r0, endRow: r1, startCol: c0, endCol: c1 },
      {
        onSuccess: (tables) => {
          onRegionParsed?.(tables);
        },
      },
    );
  }, [fileId, sheetName, parseRegion, onRegionParsed]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        handleMouseUp();
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [handleMouseUp]);

  const visibleRange = useMemo(() => {
    const totalRows = sheetData?.length ?? 0;
    if (totalRows === 0) {
      return { start: 0, end: -1 };
    }
    const effectiveViewportHeight = Math.max(ROW_HEIGHT, viewportHeight - HEADER_HEIGHT);
    const firstVisibleRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const visibleCount = Math.max(1, Math.ceil(effectiveViewportHeight / ROW_HEIGHT));
    const start = Math.max(0, firstVisibleRow - VIRTUAL_OVERSCAN_ROWS);
    const end = Math.min(totalRows - 1, firstVisibleRow + visibleCount + VIRTUAL_OVERSCAN_ROWS - 1);
    return { start, end };
  }, [sheetData, scrollTop, viewportHeight]);

  const selectionRect = useMemo(() => getSelectionRect(selection), [selection]);

  if (!fileId || !sheetName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <Grid3X3 className="w-10 h-10 mb-4 opacity-20" />
        <p className="text-sm">{t("spreadsheet.status.selectSheet")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-3 text-primary" />
        <p className="text-sm">{t("spreadsheet.status.loading")}</p>
      </div>
    );
  }

  if (error || !sheetData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <p className="text-sm text-red-500">{translatedError?.description || t("spreadsheet.status.loadFailed")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="px-3 py-1.5 border-b border-border/60 bg-background/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MousePointerSquareDashed className="w-3.5 h-3.5" />
          <span>{t("spreadsheet.status.dragHint")}</span>
        </div>
        <div className="flex items-center gap-2">
          {selection && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {rangeLabel(selection)}
            </span>
          )}
          {isParsing && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          <span className="text-[10px] text-muted-foreground">
            {sheetData.length}R × {maxCols}C
          </span>
        </div>
      </div>

      {/* Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto select-none"
        style={{ contain: "strict" }}
        onScroll={handleScroll}
      >
        <div className="relative w-max min-w-full">
          <SpreadsheetGrid
            maxCols={maxCols}
            rowStart={visibleRange.start}
            rowEnd={visibleRange.end}
            sheetData={sheetData}
            onCellMouseDown={handleMouseDown}
            onCellMouseEnter={handleMouseEnter}
          />
          {selectionRect && (
            <div
              className={cn(
                "pointer-events-none absolute border border-primary/60 bg-primary/15",
                isDragging ? "shadow-[0_0_0_1px_rgba(59,130,246,0.35)]" : "",
              )}
              style={{
                left: selectionRect.left,
                top: selectionRect.top,
                width: selectionRect.width,
                height: selectionRect.height,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
