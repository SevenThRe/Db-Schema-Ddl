// ResultGridPane — query result grid shell.
//
// Runtime responsibility:
//   - loading and empty states
//   - multi-statement batch navigation
//   - active batch selection
//   - Stop on error shell control

import { useEffect } from "react";
import type {
  PendingDeleteRowSummary,
  PendingEditRowSummary,
} from "./grid-edit-summary";
import { BatchTabs, ScriptRunSummary } from "./result-grid-batch-navigation";
import {
  ResultGridEmptyState,
  ResultGridLoadingState,
  ResultGridStopOnErrorBar,
} from "./result-grid-pane-chrome";
import {
  ResultGridSingleBatch,
} from "./result-grid-single-batch";
import type {
  DbGridDeleteRowDraft,
  DbGridEditEligibility,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbQueryBatchResult,
  DbQueryRow,
  DbTableSchema,
} from "@shared/schema";

export interface ResultGridPaneProps {
  /** 実行結果バッチ一覧（マルチステートメント対応） */
  batches: DbQueryBatchResult[];
  /** 現在表示しているバッチ index */
  activeIndex: number;
  /** バッチ切替コールバック */
  onActiveIndexChange: (index: number) => void;
  /** ロードモアボタン押下時のコールバック（batchIndex を渡す） */
  onLoadMore: (batchIndex: number) => void;
  /** クエリ実行中フラグ */
  isLoading: boolean;
  stopOnError: boolean;
  /** Stop on error 変更コールバック */
  onStopOnErrorChange: (value: boolean) => void;
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
  onAddInsertedRow: () => void;
  onEditInsertedRowValue: (
    rowDraftId: string,
    columnName: string,
    nextValue: DbQueryRow["values"][number] | undefined,
  ) => void;
  onDiscardInsertedRow: (rowDraftId: string) => void;
  onStageDeleteRow: (row: DbGridDeleteRowDraft) => void;
  onRevertDeleteRow: (rowPkTuple: string) => void;
  onPrepareCommit: () => void;
  onDiscardEdits: () => void;
}

/**
 * ResultGridPane — クエリ結果グリッドパネル
 *
 * マルチバッチタブ + 仮想スクロールグリッド + ロードモア + Stop on error トグル
 */
export function ResultGridPane({
  batches,
  activeIndex,
  onActiveIndexChange,
  onLoadMore,
  isLoading,
  stopOnError,
  onStopOnErrorChange,
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
}: ResultGridPaneProps) {
  useEffect(() => {
    if (activeIndex >= batches.length && batches.length > 0) {
      onActiveIndexChange(batches.length - 1);
    }
  }, [batches.length, activeIndex, onActiveIndexChange]);

  const handleStopOnErrorChange = (value: boolean) => {
    onStopOnErrorChange(value);
  };

  if (isLoading) {
    return <ResultGridLoadingState />;
  }

  if (batches.length === 0) {
    return (
      <ResultGridEmptyState
        stopOnError={stopOnError}
        onStopOnErrorChange={handleStopOnErrorChange}
      />
    );
  }

  const activeBatch = batches[Math.min(activeIndex, batches.length - 1)];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScriptRunSummary
        batches={batches}
        activeIndex={activeIndex}
        onSelect={onActiveIndexChange}
      />

      <BatchTabs
        batches={batches}
        activeIndex={activeIndex}
        onSelect={onActiveIndexChange}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResultGridSingleBatch
          batch={activeBatch}
          batchIndex={activeIndex}
          onLoadMore={onLoadMore}
          editEligibility={editEligibility}
          tableSchema={tableSchema}
          primaryKeyColumns={primaryKeyColumns}
          pendingEditCells={pendingEditCells}
          pendingEditRows={pendingEditRows}
          pendingInsertedRows={pendingInsertedRows}
          pendingDeleteRows={pendingDeleteRows}
          pendingDeletedRows={pendingDeletedRows}
          pendingEditCount={pendingEditCount}
          pendingInsertedCount={pendingInsertedCount}
          pendingDeleteCount={pendingDeleteCount}
          onEditCell={onEditCell}
          onRevertCell={onRevertCell}
          onRevertRow={onRevertRow}
          onAddInsertedRow={onAddInsertedRow}
          onEditInsertedRowValue={onEditInsertedRowValue}
          onDiscardInsertedRow={onDiscardInsertedRow}
          onStageDeleteRow={onStageDeleteRow}
          onRevertDeleteRow={onRevertDeleteRow}
          onPrepareCommit={onPrepareCommit}
          onDiscardEdits={onDiscardEdits}
        />
      </div>

      <ResultGridStopOnErrorBar
        id="stop-on-error"
        stopOnError={stopOnError}
        onStopOnErrorChange={handleStopOnErrorChange}
      />
    </div>
  );
}
