import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type {
  PendingDeleteRowSummary,
  PendingEditRowSummary,
} from "./grid-edit-summary";
import {
  buildPendingDeleteLookup,
  buildPendingEditLookup,
  calcDefaultColumnWidth,
  type GridCellValue,
} from "./result-grid-row-model";
import {
  buildResultGridBatchMetrics,
  buildResultGridRowViews,
  filterResultGridRows,
} from "./result-grid-batch-model";
import { useResultGridSingleBatchCopyActions } from "./result-grid-single-batch-copy-runtime";
import { useResultGridSingleBatchEditActions } from "./result-grid-single-batch-edit-runtime";
import type {
  DbGridDeleteRowDraft,
  DbGridEditEligibility,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbQueryBatchResult,
  DbTableSchema,
} from "@shared/schema";

export interface UseResultGridSingleBatchRuntimeInput {
  batch: DbQueryBatchResult;
  editEligibility?: DbGridEditEligibility;
  tableSchema?: DbTableSchema | null;
  primaryKeyColumns?: string[];
  pendingEditCells: Record<string, DbGridEditPatchCell>;
  pendingEditRows: PendingEditRowSummary[];
  pendingInsertedRows: Record<string, DbGridInsertedRowDraft>;
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>;
  pendingDeletedRows: PendingDeleteRowSummary[];
  pendingEditCount: number;
  pendingInsertedCount: number;
  pendingDeleteCount: number;
  onEditCell: (patch: DbGridEditPatchCell) => void;
  onRevertCell: (rowPkTuple: string, columnName: string) => void;
  onRevertRow: (rowPkTuple: string) => void;
  onEditInsertedRowValue: (
    rowDraftId: string,
    columnName: string,
    nextValue: GridCellValue | undefined,
  ) => void;
  onDiscardInsertedRow: (rowDraftId: string) => void;
  onStageDeleteRow: (row: DbGridDeleteRowDraft) => void;
  onRevertDeleteRow: (rowPkTuple: string) => void;
}

export function useResultGridSingleBatchRuntime({
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
}: UseResultGridSingleBatchRuntimeInput) {
  const [columnWidths, setColumnWidths] = useState<number[]>(() =>
    batch.columns.map(calcDefaultColumnWidth),
  );
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [filterText, setFilterText] = useState("");

  const dragState = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const primaryKeyList = useMemo(() => primaryKeyColumns ?? [], [primaryKeyColumns]);
  const primaryKeySet = useMemo(() => new Set(primaryKeyList), [primaryKeyList]);
  const tableColumnByName = useMemo(
    () => new Map((tableSchema?.columns ?? []).map((column) => [column.name, column])),
    [tableSchema],
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
    (event: ReactMouseEvent, colIndex: number) => {
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
  }, [batch.sql]);

  const normalizedFilter = filterText.trim().toLowerCase();
  const rowViews = useMemo(
    () =>
      buildResultGridRowViews({
        batch,
        primaryKeyList,
        pendingEditLookup,
        pendingDeleteLookup,
        pendingInsertedRows,
      }),
    [
      batch,
      pendingDeleteLookup,
      pendingEditLookup,
      pendingInsertedRows,
      primaryKeyList,
    ],
  );
  const filteredRows = useMemo(() => {
    return filterResultGridRows(rowViews, normalizedFilter);
  }, [normalizedFilter, rowViews]);

  useEffect(() => {
    if (selectedRow === null) return;
    if (selectedRow < filteredRows.length) return;
    setSelectedRow(null);
  }, [filteredRows.length, selectedRow]);

  const selectedRowData = selectedRow === null ? null : filteredRows[selectedRow] ?? null;
  const selectedLoadedIndex =
    !selectedRowData || selectedRowData.kind !== "loaded" ? null : selectedRowData.sourceIndex + 1;

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const filteredCount = filteredRows.length;
  const batchMetrics = buildResultGridBatchMetrics(batch, filteredCount);
  const pendingSummaryRows = pendingEditRows.slice(0, 4);
  const pendingDeleteSummaryRows = pendingDeletedRows.slice(0, 4);
  const pendingMutationCount = pendingEditCount + pendingInsertedCount + pendingDeleteCount;

  const headerHeight = 28;
  const filterBarHeight = 42;
  const statusHeight = 36;
  const inspectorHeight = 177;
  const inspectorOffset = selectedRowData ? inspectorHeight : 49;
  const gridHeight = Math.max(
    64,
    containerSize.height - headerHeight - filterBarHeight - statusHeight - inspectorOffset,
  );

  const copyActions = useResultGridSingleBatchCopyActions({
    selectedRowData,
    columns: batch.columns,
  });
  const editActions = useResultGridSingleBatchEditActions({
    isEditEnabled,
    selectedRowData,
    primaryKeySet,
    pendingEditLookup,
    onEditCell,
    onRevertCell,
    onRevertRow,
    onEditInsertedRowValue,
    onDiscardInsertedRow,
    onStageDeleteRow,
    onRevertDeleteRow,
    onSelectRow: setSelectedRow,
  });

  useEffect(() => {
    editActions.clearEditing();
  }, [batch.sql, editActions.clearEditing]);

  return {
    containerRef,
    columnWidths,
    containerSize,
    selectedRow,
    setSelectedRow,
    filterText,
    setFilterText,
    editingCell: editActions.editingCell,
    editingValue: editActions.editingValue,
    setEditingValue: editActions.setEditingValue,
    primaryKeySet,
    tableColumnByName,
    isEditEnabled,
    filteredRows,
    selectedRowData,
    selectedLoadedIndex,
    totalWidth,
    filteredCount,
    batchMetrics,
    pendingSummaryRows,
    pendingDeleteSummaryRows,
    pendingMutationCount,
    headerHeight,
    gridHeight,
    handleResizeMouseDown,
    handleCopyRowJson: copyActions.handleCopyRowJson,
    handleCopyRowTsv: copyActions.handleCopyRowTsv,
    handleCopyCell: copyActions.handleCopyCell,
    handleRevertSelectedCell: editActions.handleRevertSelectedCell,
    handleRevertSelectedRow: editActions.handleRevertSelectedRow,
    handleStageDeleteSelectedRow: editActions.handleStageDeleteSelectedRow,
    handleRevertSelectedDelete: editActions.handleRevertSelectedDelete,
    commitEdit: editActions.commitEdit,
    startEdit: editActions.startEdit,
    cancelEdit: editActions.cancelEdit,
  };
}
