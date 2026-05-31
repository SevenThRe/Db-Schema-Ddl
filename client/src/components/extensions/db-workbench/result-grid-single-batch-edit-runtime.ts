import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbQueryColumn,
} from "@shared/schema";
import { buildGridEditCommitPlan } from "./result-grid-edit-model";
import {
  formatCellValue,
  type GridCellValue,
  type GridRowView,
} from "./result-grid-row-model";

export interface ResultGridSingleBatchEditActionsInput {
  isEditEnabled: boolean;
  selectedRowData: GridRowView | null;
  primaryKeySet: Set<string>;
  pendingEditLookup: Map<string, Map<string, DbGridEditPatchCell>>;
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
  onSelectRow: (rowIndex: number) => void;
}

export function useResultGridSingleBatchEditActions({
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
  onSelectRow,
}: ResultGridSingleBatchEditActionsInput) {
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    columnName: string;
  } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const clearEditing = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);

  const handleRevertSelectedCell = useCallback(
    (columnName: string) => {
      if (!selectedRowData) return;
      clearEditing();
      if (selectedRowData.kind === "insert-draft") {
        onEditInsertedRowValue(selectedRowData.rowDraftId, columnName, undefined);
        return;
      }
      if (!selectedRowData.rowPkTuple) return;
      onRevertCell(selectedRowData.rowPkTuple, columnName);
    },
    [clearEditing, onEditInsertedRowValue, onRevertCell, selectedRowData],
  );

  const handleRevertSelectedRow = useCallback(() => {
    if (!selectedRowData) return;
    clearEditing();
    if (selectedRowData.kind === "insert-draft") {
      onDiscardInsertedRow(selectedRowData.rowDraftId);
      return;
    }
    if (!selectedRowData.rowPkTuple) return;
    onRevertRow(selectedRowData.rowPkTuple);
  }, [clearEditing, onDiscardInsertedRow, onRevertRow, selectedRowData]);

  const handleStageDeleteSelectedRow = useCallback(() => {
    if (!selectedRowData || selectedRowData.kind !== "loaded") return;
    if (!selectedRowData.rowPkTuple || !selectedRowData.rowPrimaryKey) return;
    clearEditing();
    onStageDeleteRow({
      rowPkTuple: selectedRowData.rowPkTuple,
      rowPrimaryKey: selectedRowData.rowPrimaryKey,
    });
  }, [clearEditing, onStageDeleteRow, selectedRowData]);

  const handleRevertSelectedDelete = useCallback(() => {
    if (!selectedRowData || selectedRowData.kind !== "loaded") return;
    if (!selectedRowData.rowPkTuple) return;
    clearEditing();
    onRevertDeleteRow(selectedRowData.rowPkTuple);
  }, [clearEditing, onRevertDeleteRow, selectedRowData]);

  const commitEdit = useCallback(
    (
      rowView: GridRowView,
      rowIndex: number,
      column: DbQueryColumn,
      columnIndex: number,
      nextRawValue: string,
    ) => {
      if (!isEditEnabled) {
        clearEditing();
        return;
      }
      const commitPlan = buildGridEditCommitPlan({
        isEditEnabled,
        rowView,
        column,
        columnIndex,
        nextRawValue,
        primaryKeySet,
        pendingEditLookup,
      });

      if (commitPlan.kind === "insert") {
        onEditInsertedRowValue(
          commitPlan.rowDraftId,
          commitPlan.columnName,
          commitPlan.nextValue,
        );
        onSelectRow(rowIndex);
        clearEditing();
        return;
      }

      if (commitPlan.kind === "ignore") {
        clearEditing();
        return;
      }

      if (commitPlan.kind === "missing-primary-key") {
        toast({
          title: commitPlan.title,
          description: commitPlan.description,
          variant: "destructive",
        });
        clearEditing();
        return;
      }

      onEditCell(commitPlan.patch);
      onSelectRow(rowIndex);
      clearEditing();
    },
    [
      clearEditing,
      isEditEnabled,
      onEditCell,
      onEditInsertedRowValue,
      onSelectRow,
      pendingEditLookup,
      primaryKeySet,
      toast,
    ],
  );

  const startEdit = useCallback(
    (rowView: GridRowView, rowIndex: number, column: DbQueryColumn, columnIndex: number) => {
      if (!isEditEnabled) return;
      if (
        rowView.kind === "loaded" &&
        (primaryKeySet.has(column.name) || rowView.isPendingDelete)
      ) {
        return;
      }
      setEditingCell({
        rowIndex,
        columnName: column.name,
      });
      if (rowView.kind === "insert-draft" && !rowView.includedColumnNames.has(column.name)) {
        setEditingValue("");
      } else {
        setEditingValue(formatCellValue(rowView.displayValues[columnIndex] ?? null));
      }
    },
    [isEditEnabled, primaryKeySet],
  );

  return {
    editingCell,
    editingValue,
    setEditingValue,
    handleRevertSelectedCell,
    handleRevertSelectedRow,
    handleStageDeleteSelectedRow,
    handleRevertSelectedDelete,
    commitEdit,
    startEdit,
    cancelEdit: clearEditing,
    clearEditing,
  };
}
