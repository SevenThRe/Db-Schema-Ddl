import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  const [dragStart, setDragStart] = useState<CellCoord | null>(null);

  // Reset selection when sheet changes
  useEffect(() => {
    setSelection(null);
  }, [fileId, sheetName]);

  const maxCols = useMemo(() => {
    if (!sheetData) return 0;
    let max = 0;
    sheetData.forEach((row) => {
      if (row && row.length > max) max = row.length;
    });
    return Math.max(max, 5);
  }, [sheetData]);

  const isInSelection = useCallback(
    (r: number, c: number) => {
      if (!selection) return false;
      const r0 = Math.min(selection.start.row, selection.end.row);
      const r1 = Math.max(selection.start.row, selection.end.row);
      const c0 = Math.min(selection.start.col, selection.end.col);
      const c1 = Math.max(selection.start.col, selection.end.col);
      return r >= r0 && r <= r1 && c >= c0 && c <= c1;
    },
    [selection]
  );

  const handleMouseDown = useCallback((r: number, c: number) => {
    setIsDragging(true);
    setDragStart({ row: r, col: c });
    setSelection({ start: { row: r, col: c }, end: { row: r, col: c } });
  }, []);

  const handleMouseEnter = useCallback(
    (r: number, c: number) => {
      if (isDragging && dragStart) {
        setSelection({ start: dragStart, end: { row: r, col: c } });
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !selection || !fileId || !sheetName) {
      setIsDragging(false);
      return;
    }
    setIsDragging(false);

    const r0 = Math.min(selection.start.row, selection.end.row);
    const r1 = Math.max(selection.start.row, selection.end.row);
    const c0 = Math.min(selection.start.col, selection.end.col);
    const c1 = Math.max(selection.start.col, selection.end.col);

    // Only parse if selection is meaningful (at least 2 rows)
    if (r1 - r0 < 1) return;

    parseRegion(
      { fileId, sheetName, startRow: r0, endRow: r1, startCol: c0, endCol: c1 },
      {
        onSuccess: (tables) => {
          onRegionParsed?.(tables);
        },
      }
    );
  }, [isDragging, selection, fileId, sheetName, parseRegion, onRegionParsed]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) handleMouseUp();
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card/50 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MousePointerSquareDashed className="w-3.5 h-3.5" />
          <span>{t("spreadsheet.status.dragHint")}</span>
        </div>
        <div className="flex items-center gap-2">
          {selection && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
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
      <div className="flex-1 overflow-auto select-none" style={{ contain: "strict" }}>
        <table className="border-collapse text-[11px] font-mono" style={{ minWidth: "100%" }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-muted border-r border-b border-border w-[42px] min-w-[42px] text-center text-[10px] text-muted-foreground font-medium" />
              {Array.from({ length: maxCols }, (_, c) => (
                <th
                  key={c}
                  className="bg-muted border-r border-b border-border px-1.5 py-1 text-center text-[10px] text-muted-foreground font-medium min-w-[72px] max-w-[160px]"
                >
                  {colToLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheetData.map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-[1] bg-muted border-r border-b border-border px-1.5 py-0.5 text-center text-[10px] text-muted-foreground font-medium">
                  {r + 1}
                </td>
                {Array.from({ length: maxCols }, (_, c) => {
                  const val = row?.[c];
                  const inSel = isInSelection(r, c);
                  const hasValue = val !== null && val !== undefined && String(val).trim() !== "";

                  return (
                    <td
                      key={c}
                      onMouseDown={() => handleMouseDown(r, c)}
                      onMouseEnter={() => handleMouseEnter(r, c)}
                      className={cn(
                        "border-r border-b border-border px-1.5 py-0.5 cursor-cell max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap",
                        inSel
                          ? "bg-primary/15 outline outline-1 outline-primary/50 -outline-offset-1"
                          : r % 2 === 0
                          ? "bg-background"
                          : "bg-muted/20",
                        hasValue ? "text-foreground" : "text-transparent"
                      )}
                      title={hasValue ? String(val) : ""}
                    >
                      {hasValue ? String(val) : "\u00A0"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
