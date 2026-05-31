import type {
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import { cn } from "@/lib/utils";
import { DataSyncRowDiffPane } from "./DataSyncRowDiffPane";
import type {
  DataSyncRowDiffEntry,
  DataSyncSuggestedAction,
} from "./data-sync-row-diff";
import {
  describeDataSyncBlocker,
  formatDataSyncCounts,
} from "./data-sync-utils";
import { formatColumnPreview } from "./workbench-collection-utils";

interface WorkbenchDataSyncDiffBrowserProps {
  diffPreview: DbDataDiffPreviewResponse | null;
  diffDetail: DbDataDiffDetailResponse | null;
  onLoadDataDiffDetail: (tableName: string) => void;
  syncIncludeUnchanged: boolean;
  onToggleIncludeUnchangedRows: (includeUnchanged: boolean) => void;
  diffRows: DataSyncRowDiffEntry[];
  selectedDiffRowIndex: number;
  onSelectDiffRow: (rowIndex: number) => void;
  onChangeSyncRowAction: (
    rowIndex: number,
    nextAction: DataSyncSuggestedAction,
  ) => void;
  activeDiffRow: DataSyncRowDiffEntry | null;
}

function formatDataSyncRowKey(row: DataSyncRowDiffEntry): string {
  return Object.entries(row.rowKey)
    .map(([key, value]) => `${key}=${value ?? "null"}`)
    .join(", ");
}

export function WorkbenchDataSyncDiffBrowser({
  diffPreview,
  diffDetail,
  onLoadDataDiffDetail,
  syncIncludeUnchanged,
  onToggleIncludeUnchangedRows,
  diffRows,
  selectedDiffRowIndex,
  onSelectDiffRow,
  onChangeSyncRowAction,
  activeDiffRow,
}: WorkbenchDataSyncDiffBrowserProps) {
  return (
    <div className="min-h-0 flex flex-1 overflow-hidden">
      <div className="w-[280px] shrink-0 border-r border-border">
        <div className="border-b border-border bg-panel-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Compare Summary
        </div>
        <div className="h-full overflow-auto p-2">
          {!diffPreview ? (
            <p className="text-xs text-muted-foreground">
              Run compare preview to inspect per-table insert/update/delete deltas.
            </p>
          ) : (
            <div className="space-y-2">
              {diffPreview.tableSummaries.map((summary) => {
                const active = diffDetail?.tableName === summary.tableName;
                return (
                  <button
                    key={`summary-${summary.tableName}`}
                    type="button"
                    onClick={() => onLoadDataDiffDetail(summary.tableName)}
                    className={cn(
                      "w-full rounded-sm border p-2 text-left text-xs",
                      active
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border bg-background hover:bg-muted/30",
                    )}
                  >
                    <p className="truncate font-mono text-[11px] font-semibold">
                      {summary.tableName}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDataSyncCounts(summary.statusCounts)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Keys: {formatColumnPreview(summary.keyColumns, "none detected", 4)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Compare: {formatColumnPreview(summary.compareColumns, "runtime default empty", 4)}
                    </p>
                    {summary.blockerCodes.length > 0 ? (
                      <p className="mt-1 text-[11px] text-destructive">
                        {summary.blockerCodes.join(", ")}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="w-[320px] shrink-0 border-r border-border">
        <div className="flex items-center justify-between border-b border-border bg-panel-muted/40 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Row Deltas
          </span>
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={syncIncludeUnchanged}
              onChange={(event) => onToggleIncludeUnchangedRows(event.target.checked)}
            />
            include unchanged
          </label>
        </div>
        <div className="h-full overflow-auto p-2">
          {!diffDetail ? (
            <p className="text-xs text-muted-foreground">
              Select a table summary to load row-level diff detail.
            </p>
          ) : (
            <div className="space-y-2">
              {diffDetail.blockers.length > 0 ? (
                <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                  {diffDetail.blockers.map((blocker) => (
                    <p key={`detail-blocker-${blocker.code}`}>
                      {blocker.code}: {describeDataSyncBlocker(blocker.code)}
                    </p>
                  ))}
                </div>
              ) : null}
              {diffRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No row differences found in current table.
                </p>
              ) : (
                diffRows.map((row, index) => {
                  const active = index === selectedDiffRowIndex;
                  const rowKeyLabel = formatDataSyncRowKey(row);
                  return (
                    <div
                      key={`row-diff-${index}-${rowKeyLabel}`}
                      className={cn(
                        "rounded-sm border p-2",
                        active
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-border bg-background",
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => onSelectDiffRow(index)}
                      >
                        <p className="truncate font-mono text-[11px]">{rowKeyLabel}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.status}
                        </p>
                      </button>
                      <div className="mt-2">
                        <label className="mb-1 block text-[11px] text-muted-foreground">
                          Apply action
                        </label>
                        <select
                          className="h-7 w-full rounded-sm border border-border bg-background px-2 text-xs"
                          value={row.suggestedAction ?? "ignore"}
                          onChange={(event) =>
                            onChangeSyncRowAction(
                              index,
                              event.target.value as DataSyncSuggestedAction,
                            )
                          }
                        >
                          <option value="insert">insert</option>
                          <option value="update">update</option>
                          <option value="delete">delete</option>
                          <option value="ignore">ignore</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden bg-background">
        <DataSyncRowDiffPane entry={activeDiffRow} className="h-full" />
      </div>
    </div>
  );
}
