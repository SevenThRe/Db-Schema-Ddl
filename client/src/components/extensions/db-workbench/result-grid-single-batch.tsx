import type { UseResultGridSingleBatchRuntimeInput } from "./result-grid-single-batch-runtime";
import { useResultGridSingleBatchRuntime } from "./result-grid-single-batch-runtime";
import {
  ResultGridBody,
  type ResultGridRowComponent,
} from "./result-grid-body";
import { ResultGridColumnHeader } from "./result-grid-column-header";
import { ResultGridRow } from "./result-grid-row";
import { SelectedRowInspector } from "./result-grid-row-inspector";
import {
  PendingMutationBar,
  PendingRowSummaries,
  ResultGridFooter,
} from "./result-grid-status-panels";
import { ResultGridToolbar } from "./result-grid-toolbar";

export interface ResultGridSingleBatchProps extends UseResultGridSingleBatchRuntimeInput {
  batchIndex: number;
  onLoadMore: (batchIndex: number) => void;
  onAddInsertedRow: () => void;
  onPrepareCommit: () => void;
  onDiscardEdits: () => void;
}

export function ResultGridSingleBatch({
  batch,
  batchIndex,
  onLoadMore,
  editEligibility,
  tableSchema,
  primaryKeyColumns,
  pendingEditCells,
  pendingEditRows,
  pendingInsertedRows,
  pendingDeleteRows,
  pendingDeletedRows,
  pendingEditCount,
  pendingInsertedCount,
  pendingDeleteCount,
  onEditCell,
  onRevertCell,
  onRevertRow,
  onAddInsertedRow,
  onEditInsertedRowValue,
  onDiscardInsertedRow,
  onStageDeleteRow,
  onRevertDeleteRow,
  onPrepareCommit,
  onDiscardEdits,
}: ResultGridSingleBatchProps) {
  const runtime = useResultGridSingleBatchRuntime({
    batch,
    editEligibility,
    tableSchema,
    primaryKeyColumns,
    pendingEditCells,
    pendingEditRows,
    pendingInsertedRows,
    pendingDeleteRows,
    pendingDeletedRows,
    pendingEditCount,
    pendingInsertedCount,
    pendingDeleteCount,
    onEditCell,
    onRevertCell,
    onRevertRow,
    onEditInsertedRowValue,
    onDiscardInsertedRow,
    onStageDeleteRow,
    onRevertDeleteRow,
  });

  if (batch.error) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-destructive">Query failed</p>
        <p className="text-xs text-destructive">{batch.error}</p>
        <p className="text-xs text-muted-foreground">Edit your query and try again.</p>
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

  const RowRenderer: ResultGridRowComponent = ({ index, style }) => {
    const rowView = runtime.filteredRows[index];
    return (
      <ResultGridRow
        rowView={rowView}
        rowIndex={index}
        style={style}
        columns={batch.columns}
        columnWidths={runtime.columnWidths}
        isSelected={runtime.selectedRow === index}
        isEditEnabled={runtime.isEditEnabled}
        primaryKeySet={runtime.primaryKeySet}
        editingCell={runtime.editingCell}
        editingValue={runtime.editingValue}
        columnMetadataByName={runtime.tableColumnByName}
        onSelectRow={runtime.setSelectedRow}
        onEditingValueChange={runtime.setEditingValue}
        onStartEdit={runtime.startEdit}
        onCommitEdit={runtime.commitEdit}
        onCancelEdit={runtime.cancelEdit}
      />
    );
  };

  return (
    <div ref={runtime.containerRef} className="flex h-full flex-col overflow-hidden">
      <ResultGridToolbar
        filterText={runtime.filterText}
        onFilterTextChange={runtime.setFilterText}
        isRowWindowTruncated={runtime.batchMetrics.isRowWindowTruncated}
        isEditEnabled={runtime.isEditEnabled}
        filteredCount={runtime.filteredCount}
        loadedCount={runtime.batchMetrics.loadedCount}
        pendingInsertedCount={Object.keys(pendingInsertedRows).length}
        retainedCount={runtime.batchMetrics.retainedCount}
        totalLabel={runtime.batchMetrics.totalLabel}
        selectedLoadedIndex={runtime.selectedLoadedIndex ?? undefined}
        onAddInsertedRow={onAddInsertedRow}
      />

      <ResultGridColumnHeader
        columns={batch.columns}
        columnWidths={runtime.columnWidths}
        headerHeight={runtime.headerHeight}
        totalWidth={runtime.totalWidth}
        onResizeMouseDown={runtime.handleResizeMouseDown}
      />

      <ResultGridBody
        rowCount={runtime.filteredRows.length}
        hasSourceRows={batch.rows.length > 0}
        containerHeight={runtime.containerSize.height}
        containerWidth={runtime.containerSize.width}
        gridHeight={runtime.gridHeight}
        totalWidth={runtime.totalWidth}
        rowComponent={RowRenderer}
      />

      <ResultGridFooter
        canLoadMore={runtime.batchMetrics.canLoadMore}
        isPagingUnsupported={runtime.batchMetrics.isPagingUnsupported}
        footerStatusLabel={runtime.batchMetrics.footerStatusLabel}
        unsupportedPagingText={runtime.batchMetrics.unsupportedPagingText}
        filteredCount={runtime.filteredCount}
        loadedCount={runtime.batchMetrics.loadedCount}
        elapsedMs={batch.elapsedMs}
        isRowWindowTruncated={runtime.batchMetrics.isRowWindowTruncated}
        loadMoreCount={runtime.batchMetrics.loadMoreCount}
        onLoadMore={() => onLoadMore(batchIndex)}
      />

      <PendingRowSummaries
        pendingEditRows={pendingEditRows}
        pendingDeletedRows={pendingDeletedRows}
        pendingSummaryRows={runtime.pendingSummaryRows}
        pendingDeleteSummaryRows={runtime.pendingDeleteSummaryRows}
        onRevertRow={onRevertRow}
        onRevertDeleteRow={onRevertDeleteRow}
      />

      <PendingMutationBar
        pendingEditCount={pendingEditCount}
        pendingInsertedCount={pendingInsertedCount}
        pendingDeleteCount={pendingDeleteCount}
        pendingEditRowsCount={pendingEditRows.length}
        isEditEnabled={runtime.isEditEnabled}
        pendingMutationCount={runtime.pendingMutationCount}
        onPrepareCommit={onPrepareCommit}
        onDiscardEdits={onDiscardEdits}
      />

      <SelectedRowInspector
        rowValues={runtime.selectedRowData?.displayValues ?? null}
        rowPkTuple={
          runtime.selectedRowData?.kind === "loaded"
            ? runtime.selectedRowData.rowPkTuple ?? null
            : null
        }
        insertDraftId={
          runtime.selectedRowData?.kind === "insert-draft"
            ? runtime.selectedRowData.rowDraftId
            : null
        }
        isInsertDraft={runtime.selectedRowData?.kind === "insert-draft"}
        includedColumnNames={
          runtime.selectedRowData?.kind === "insert-draft"
            ? runtime.selectedRowData.includedColumnNames
            : undefined
        }
        dirtyColumnNames={runtime.selectedRowData?.dirtyColumnNames}
        isPendingDelete={runtime.selectedRowData?.isPendingDelete ?? false}
        columns={batch.columns}
        rowIndex={runtime.selectedLoadedIndex}
        canStageDelete={runtime.isEditEnabled && runtime.selectedRowData?.kind !== "insert-draft"}
        onCopyRowJson={runtime.handleCopyRowJson}
        onCopyRowTsv={runtime.handleCopyRowTsv}
        onCopyCell={runtime.handleCopyCell}
        onRevertCell={runtime.handleRevertSelectedCell}
        onRevertRow={runtime.handleRevertSelectedRow}
        onDiscardInsertedRow={runtime.handleRevertSelectedRow}
        onStageDeleteRow={runtime.handleStageDeleteSelectedRow}
        onRevertDeleteRow={runtime.handleRevertSelectedDelete}
      />
    </div>
  );
}
