import {
  buildGridRowView,
  buildInsertedRowView,
  formatCellValue,
  type GridRowView,
} from "./result-grid-row-model";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbQueryBatchResult,
} from "@shared/schema";

export interface BuildResultGridRowViewsInput {
  batch: DbQueryBatchResult;
  primaryKeyList: string[];
  pendingEditLookup: Map<string, Map<string, DbGridEditPatchCell>>;
  pendingDeleteLookup: Map<string, DbGridDeleteRowDraft>;
  pendingInsertedRows: Record<string, DbGridInsertedRowDraft>;
}

export function buildResultGridRowViews({
  batch,
  primaryKeyList,
  pendingEditLookup,
  pendingDeleteLookup,
  pendingInsertedRows,
}: BuildResultGridRowViewsInput): GridRowView[] {
  return [
    ...Object.values(pendingInsertedRows).map((draft) =>
      buildInsertedRowView(draft, batch.columns),
    ),
    ...batch.rows.map((row, sourceIndex) =>
      buildGridRowView(
        row,
        (batch.loadedRowOffset ?? 0) + sourceIndex,
        batch.columns,
        primaryKeyList,
        pendingEditLookup,
        pendingDeleteLookup,
      ),
    ),
  ];
}

export function filterResultGridRows(
  rowViews: GridRowView[],
  normalizedFilter: string,
): GridRowView[] {
  if (!normalizedFilter) return rowViews;

  return rowViews.filter((rowView) =>
    rowView.displayValues.some((value) =>
      formatCellValue(value).toLowerCase().includes(normalizedFilter),
    ),
  );
}

export interface ResultGridBatchMetrics {
  loadedCount: number;
  retainedCount: number;
  isRowWindowTruncated: boolean;
  totalRows: number | null;
  totalLabel: string;
  canLoadMore: boolean;
  isPagingUnsupported: boolean;
  unsupportedPagingText: string;
  loadMoreCount: number;
  footerStatusLabel: string;
}

export function buildResultGridBatchMetrics(
  batch: DbQueryBatchResult,
  filteredCount: number,
): ResultGridBatchMetrics {
  const loadedCount =
    typeof batch.loadedRowCount === "number"
      ? Math.max(batch.rows.length, Math.trunc(batch.loadedRowCount))
      : Math.max(batch.rows.length, batch.returnedRows || 0);
  const retainedCount = batch.rows.length;
  const isRowWindowTruncated = batch.rowWindowTruncated === true;
  const totalRows = typeof batch.totalRows === "number" ? batch.totalRows : null;
  const totalLabel = totalRows === null ? "Unknown total" : `${totalRows.toLocaleString()} total`;
  const loadMoreCount =
    totalRows !== null && typeof batch.nextOffset === "number"
      ? Math.max(1, Math.min(1000, Math.max(0, totalRows - batch.nextOffset)))
      : 1000;
  const canLoadMore = batch.pagingMode === "offset" && batch.hasMore;
  const isPagingUnsupported = batch.pagingMode === "unsupported";
  const unsupportedPagingText = "Load more unavailable for this result.";
  const footerStatusLabel = isRowWindowTruncated
    ? `${filteredCount.toLocaleString()} shown / ${retainedCount.toLocaleString()} retained / ${loadedCount.toLocaleString()} loaded / ${totalLabel}`
    : `${filteredCount.toLocaleString()} shown / ${loadedCount.toLocaleString()} loaded / ${totalLabel}`;

  return {
    loadedCount,
    retainedCount,
    isRowWindowTruncated,
    totalRows,
    totalLabel,
    canLoadMore,
    isPagingUnsupported,
    unsupportedPagingText,
    loadMoreCount,
    footerStatusLabel,
  };
}
