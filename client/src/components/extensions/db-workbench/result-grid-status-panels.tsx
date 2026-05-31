import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  PendingDeleteRowSummary,
  PendingEditRowSummary,
} from "./grid-edit-summary";

export function ResultGridFooter({
  canLoadMore,
  isPagingUnsupported,
  footerStatusLabel,
  unsupportedPagingText,
  filteredCount,
  loadedCount,
  elapsedMs,
  isRowWindowTruncated,
  loadMoreCount,
  onLoadMore,
}: {
  canLoadMore: boolean;
  isPagingUnsupported: boolean;
  footerStatusLabel: string;
  unsupportedPagingText: string;
  filteredCount: number;
  loadedCount: number;
  elapsedMs: number;
  isRowWindowTruncated: boolean;
  loadMoreCount: number;
  onLoadMore: () => void;
}) {
  return (
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
            onClick={onLoadMore}
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
            {filteredCount.toLocaleString()} shown / {loadedCount.toLocaleString()} loaded ({elapsedMs}ms)
          </span>
          {isRowWindowTruncated ? (
            <span>Older loaded rows were released to control memory.</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function PendingRowSummaries({
  pendingEditRows,
  pendingDeletedRows,
  pendingSummaryRows,
  pendingDeleteSummaryRows,
  onRevertRow,
  onRevertDeleteRow,
}: {
  pendingEditRows: PendingEditRowSummary[];
  pendingDeletedRows: PendingDeleteRowSummary[];
  pendingSummaryRows: PendingEditRowSummary[];
  pendingDeleteSummaryRows: PendingDeleteRowSummary[];
  onRevertRow: (rowPkTuple: string) => void;
  onRevertDeleteRow: (rowPkTuple: string) => void;
}) {
  if (pendingEditRows.length === 0 && pendingDeletedRows.length === 0) {
    return null;
  }

  return (
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
  );
}

export function PendingMutationBar({
  pendingEditCount,
  pendingInsertedCount,
  pendingDeleteCount,
  pendingEditRowsCount,
  isEditEnabled,
  pendingMutationCount,
  onPrepareCommit,
  onDiscardEdits,
}: {
  pendingEditCount: number;
  pendingInsertedCount: number;
  pendingDeleteCount: number;
  pendingEditRowsCount: number;
  isEditEnabled: boolean;
  pendingMutationCount: number;
  onPrepareCommit: () => void;
  onDiscardEdits: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1">
      <span className="text-xs text-muted-foreground">
        Pending changes: {pendingEditCount} edited cell{pendingEditCount === 1 ? "" : "s"} across {pendingEditRowsCount} row{pendingEditRowsCount === 1 ? "" : "s"} · {pendingInsertedCount} insert draft{pendingInsertedCount === 1 ? "" : "s"} ready · {pendingDeleteCount} delete{pendingDeleteCount === 1 ? "" : "s"}
      </span>
      {pendingEditCount > 0 ? (
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
          Dirty cells highlighted
        </span>
      ) : null}
      {pendingInsertedCount > 0 ? (
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
          Draft inserts highlighted
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
  );
}
