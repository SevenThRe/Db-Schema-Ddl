import type {
  DbQueryBatchResult,
  FetchMoreRequest,
  QueryExecutionResponse,
} from "@shared/schema";
import type {
  PendingDeleteRows,
  PendingEditCells,
} from "./grid-edit-drafts";
import {
  buildFetchMoreRequest,
  buildLoadMoreFailureNotice,
  buildProtectedRowPkTuples,
  buildResultWindowCappedNotice,
  mergeFetchedBatchIntoResponse,
  validateLoadMoreBatch,
  type LoadMoreNotice,
} from "./result-load-more-runtime";
import { formatWorkbenchError } from "./workbench-errors";

export interface RunResultLoadMoreInput {
  results: QueryExecutionResponse | null;
  batchIndex: number;
  connectionId: string;
  runtimeSchema?: string | null;
  pendingEditCells: PendingEditCells;
  pendingDeleteRows: PendingDeleteRows;
  windowLimit: number;
  limit: number;
  fetchMore: (request: FetchMoreRequest) => Promise<DbQueryBatchResult>;
  updateResults: (
    updater: (
      previous: QueryExecutionResponse | null,
    ) => QueryExecutionResponse | null,
  ) => void;
  showNotification: (notice: LoadMoreNotice) => void;
  hasShownWindowCapNotice: (batchIndex: number) => boolean;
  markWindowCapNoticeShown: (batchIndex: number) => void;
}

export async function runResultLoadMore(
  input: RunResultLoadMoreInput,
): Promise<DbQueryBatchResult | null> {
  if (!input.results) {
    return null;
  }

  const batch = input.results.batches[input.batchIndex];
  if (!batch) {
    return null;
  }

  const validation = validateLoadMoreBatch(batch);
  if (!validation.ok) {
    if (validation.notice) {
      input.showNotification(validation.notice);
    }
    return null;
  }

  try {
    const moreBatch = await input.fetchMore(
      buildFetchMoreRequest({
        requestId: input.results.requestId,
        batchIndex: input.batchIndex,
        batch,
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        limit: input.limit,
      }),
    );

    let droppedRows = 0;
    input.updateResults((previous) => {
      if (!previous) {
        return previous;
      }
      const merged = mergeFetchedBatchIntoResponse({
        response: previous,
        batchIndex: input.batchIndex,
        moreBatch,
        protectedRowPkTuples: buildProtectedRowPkTuples(
          input.pendingEditCells,
          input.pendingDeleteRows,
        ),
        windowLimit: input.windowLimit,
      });
      droppedRows = merged.droppedRows;
      return merged.response;
    });

    if (
      droppedRows > 0 &&
      !input.hasShownWindowCapNotice(input.batchIndex)
    ) {
      input.markWindowCapNoticeShown(input.batchIndex);
      input.showNotification(buildResultWindowCappedNotice(input.windowLimit));
    }
    return moreBatch;
  } catch (error) {
    input.showNotification(
      buildLoadMoreFailureNotice(
        formatWorkbenchError(error, "Unable to load additional rows for this result."),
      ),
    );
    return null;
  }
}
