import { List, type ListProps } from "react-window";

export type ResultGridRowComponent = ListProps<Record<string, never>>["rowComponent"];

export function ResultGridBody({
  rowCount,
  hasSourceRows,
  containerHeight,
  containerWidth,
  gridHeight,
  totalWidth,
  rowComponent,
}: {
  rowCount: number;
  hasSourceRows: boolean;
  containerHeight: number;
  containerWidth: number;
  gridHeight: number;
  totalWidth: number;
  rowComponent: ResultGridRowComponent;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {rowCount === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {hasSourceRows
                ? "No loaded rows match the current filter."
                : "This query returned no rows."}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {hasSourceRows
                ? "Clear or refine the filter to continue browsing the current result set."
                : "Try another statement or inspect a different table."}
            </p>
          </div>
        </div>
      ) : containerHeight > 0 ? (
        <List<Record<string, never>>
          rowCount={rowCount}
          rowHeight={32}
          rowComponent={rowComponent}
          rowProps={{}}
          defaultHeight={gridHeight}
          style={{ width: Math.max(totalWidth, containerWidth) }}
        />
      ) : null}
    </div>
  );
}
