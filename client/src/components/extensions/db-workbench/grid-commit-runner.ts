import type {
  DbGridCommitRequest,
  DbGridCommitResponse,
  DbGridEditSource,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
} from "@shared/schema";
import {
  buildGridCommitFailureNotice,
  buildGridCommitRequest,
  buildPrepareGridCommitFailureNotice,
  buildPrepareGridCommitRequest,
  buildPrepareGridCommitSuccessNotice,
  resolveGridCommitResultAction,
  type GridCommitNotice,
} from "./grid-commit-runtime";
import {
  buildPendingGridCommitDrafts,
  type PendingDeleteRows,
  type PendingEditCells,
  type PendingInsertedRows,
} from "./grid-edit-drafts";
import { formatWorkbenchError } from "./workbench-errors";

export interface RunPrepareGridCommitInput {
  connectionId: string;
  runtimeSchema?: string | null;
  activeBatch: DbQueryBatchResult | null | undefined;
  fallbackSource: DbGridEditSource | null;
  pendingEditCells: PendingEditCells;
  pendingDeleteRows: PendingDeleteRows;
  pendingInsertedRows: PendingInsertedRows;
  prepareGridCommit: (
    request: DbGridPrepareCommitRequest,
  ) => Promise<DbGridPrepareCommitResponse>;
  showNotification: (notice: GridCommitNotice) => void;
  beginPrepare: () => void;
  applyPreparedPlan: (prepared: DbGridPrepareCommitResponse) => void;
  finishPrepare: () => void;
}

export function runBeginGridCommitPrepareState(input: {
  setIsPreparing: (isPreparing: boolean) => void;
}): void {
  input.setIsPreparing(true);
}

export function runApplyPreparedGridCommitPlanState(input: {
  preparedPlan: DbGridPrepareCommitResponse;
  setPreparedPlan: (preparedPlan: DbGridPrepareCommitResponse) => void;
}): void {
  input.setPreparedPlan(input.preparedPlan);
}

export function runFinishGridCommitPrepareState(input: {
  setIsPreparing: (isPreparing: boolean) => void;
}): void {
  input.setIsPreparing(false);
}

export interface GridCommitStateActions {
  beginPrepare: () => void;
  applyPreparedPlan: (preparedPlan: DbGridPrepareCommitResponse) => void;
  finishPrepare: () => void;
  beginCommit: () => void;
  clearPreparedPlan: () => void;
  clearDrafts: () => void;
  finishCommit: () => void;
}

export function createGridCommitStateActions(input: {
  setIsPreparing: (isPreparing: boolean) => void;
  setPreparedPlan: (preparedPlan: DbGridPrepareCommitResponse | null) => void;
  setIsCommitting: (isCommitting: boolean) => void;
  clearDrafts: () => void;
}): GridCommitStateActions {
  return {
    beginPrepare: () =>
      runBeginGridCommitPrepareState({
        setIsPreparing: input.setIsPreparing,
      }),
    applyPreparedPlan: (preparedPlan) =>
      runApplyPreparedGridCommitPlanState({
        preparedPlan,
        setPreparedPlan: input.setPreparedPlan,
      }),
    finishPrepare: () =>
      runFinishGridCommitPrepareState({
        setIsPreparing: input.setIsPreparing,
      }),
    beginCommit: () =>
      runBeginGridCommitApplyState({
        setIsCommitting: input.setIsCommitting,
      }),
    clearPreparedPlan: () =>
      runClearPreparedGridCommitPlanState({
        setPreparedPlan: input.setPreparedPlan,
      }),
    clearDrafts: () =>
      runClearGridCommitDraftState({
        clearDrafts: input.clearDrafts,
      }),
    finishCommit: () =>
      runFinishGridCommitApplyState({
        setIsCommitting: input.setIsCommitting,
      }),
  };
}

export async function runPrepareGridCommit(
  input: RunPrepareGridCommitInput,
): Promise<DbGridPrepareCommitResponse | null> {
  if (!input.activeBatch) {
    return null;
  }

  const buildResult = buildPrepareGridCommitRequest({
    connectionId: input.connectionId,
    runtimeSchema: input.runtimeSchema,
    activeBatch: input.activeBatch,
    fallbackSource: input.fallbackSource,
    drafts: buildPendingGridCommitDrafts(
      input.pendingEditCells,
      input.pendingDeleteRows,
      input.pendingInsertedRows,
    ),
  });
  if (buildResult.notice) {
    input.showNotification(buildResult.notice);
    return null;
  }

  input.beginPrepare();
  try {
    const prepared = await input.prepareGridCommit(buildResult.request);
    input.applyPreparedPlan(prepared);
    input.showNotification(buildPrepareGridCommitSuccessNotice(prepared));
    return prepared;
  } catch (error) {
    input.showNotification(
      buildPrepareGridCommitFailureNotice(
        formatWorkbenchError(error, "Failed to prepare safe edit commit preview."),
      ),
    );
    return null;
  } finally {
    input.finishPrepare();
  }
}

export interface RunCommitGridEditsInput {
  connectionId: string;
  preparedPlan: DbGridPrepareCommitResponse | null;
  isCommitting: boolean;
  selectedTableName: string | null;
  commitGridEdits: (
    request: DbGridCommitRequest,
  ) => Promise<DbGridCommitResponse>;
  refreshTable: (tableName: string) => Promise<unknown>;
  showNotification: (notice: GridCommitNotice) => void;
  beginCommit: () => void;
  clearPreparedPlan: () => void;
  clearDrafts: () => void;
  finishCommit: () => void;
}

export function runBeginGridCommitApplyState(input: {
  setIsCommitting: (isCommitting: boolean) => void;
}): void {
  input.setIsCommitting(true);
}

export function runClearPreparedGridCommitPlanState(input: {
  setPreparedPlan: (preparedPlan: DbGridPrepareCommitResponse | null) => void;
}): void {
  input.setPreparedPlan(null);
}

export function runClearGridCommitDraftState(input: {
  clearDrafts: () => void;
}): void {
  input.clearDrafts();
}

export function runFinishGridCommitApplyState(input: {
  setIsCommitting: (isCommitting: boolean) => void;
}): void {
  input.setIsCommitting(false);
}

export async function runCommitGridEdits(
  input: RunCommitGridEditsInput,
): Promise<DbGridCommitResponse | null> {
  if (!input.preparedPlan || input.isCommitting) {
    return null;
  }

  input.beginCommit();
  try {
    const result = await input.commitGridEdits(
      buildGridCommitRequest({
        connectionId: input.connectionId,
        preparedPlan: input.preparedPlan,
      }),
    );
    const action = resolveGridCommitResultAction(
      result,
      Boolean(input.selectedTableName),
    );

    if (action.rolledBack) {
      input.showNotification(action.notice);
      input.clearPreparedPlan();
      return result;
    }

    if (action.clearDrafts) {
      input.clearDrafts();
      input.clearPreparedPlan();
    }

    if (action.refreshTable && input.selectedTableName) {
      await input.refreshTable(input.selectedTableName);
    }

    input.showNotification(action.notice);
    return result;
  } catch (error) {
    input.showNotification(
      buildGridCommitFailureNotice(
        formatWorkbenchError(error, "Failed to commit prepared row edits."),
      ),
    );
    return null;
  } finally {
    input.finishCommit();
  }
}
