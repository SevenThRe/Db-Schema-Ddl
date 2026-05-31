import type { MouseEvent } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DbQueryColumn } from "@shared/schema";

export function ResultGridColumnHeader({
  columns,
  columnWidths,
  headerHeight,
  totalWidth,
  onResizeMouseDown,
}: {
  columns: DbQueryColumn[];
  columnWidths: number[];
  headerHeight: number;
  totalWidth: number;
  onResizeMouseDown: (event: MouseEvent, colIndex: number) => void;
}) {
  return (
    <div
      className="flex shrink-0 overflow-hidden border-b border-border bg-panel-muted"
      style={{ height: headerHeight, minWidth: totalWidth }}
    >
      {columns.map((column, columnIndex) => (
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
                  {column.name} - {column.dataType}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div
            className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/50"
            onMouseDown={(event) => onResizeMouseDown(event, columnIndex)}
          />
        </div>
      ))}
    </div>
  );
}
