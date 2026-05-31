import type {
  DbQueryBatchResult,
  FetchMoreRequest,
  QueryExecutionResponse,
} from "@shared/schema";
import type {
  PendingDeleteRows,
  PendingEditCells,
} from "./grid-edit-drafts";
import { mergeFetchedRowsIntoBatch } from "./result-grid-utils";

export type LoadMoreNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type LoadMoreValidationResult =
  | { ok: true }
  | { ok: false; notice?: LoadMoreNotice };

export type MergeFetchedBatchResult = {
  response: QueryExecutionResponse;
  droppedRows: number;
};

export function validateLoadMoreBatch(
  batch: DbQueryBatchResult,
): LoadMoreValidationResult {
  if (batch.pagingMode !== "offset" || !batch.hasMore) {
    if (batch.pagingMode === "unsupported") {
      return {
        ok: false,
        notice: {
          title: "Load more unavailable",
          description:
            batch.pagingReason ?? "Only single result-returning statements support load more.",
          variant: "destructive",
        },
      };
    }
    return { ok: false };
  }

  if (typeof batch.nextOffset !== "number") {
    return {
      ok: false,
      notice: {
        title: "Load more unavailable",
        description: "Next page offset was not provided by the runtime.",
        variant: "destructive",
      },
    };
  }

  return { ok: true };
}

export function buildFetchMoreRequest(input: {
  requestId: string;
  batchIndex: number;
  batch: DbQueryBatchResult;
  connectionId: string;
  runtimeSchema?: string | null;
  limit: number;
}): FetchMoreRequest {
  if (typeof input.batch.nextOffset !== "number") {
    throw new Error("Cannot build fetch-more request without nextOffset.");
  }

  return {
    requestId: input.requestId,
    batchIndex: input.batchIndex,
    sql: input.batch.sql,
    connectionId: input.connectionId,
    schema: input.runtimeSchema ?? undefined,
    offset: input.batch.nextOffset,
    limit: input.limit,
  };
}

export function buildProtectedRowPkTuples(
  pendingEditCells: PendingEditCells,
  pendingDeleteRows: PendingDeleteRows,
): Set<string> {
  return new Set([
    ...Object.values(pendingEditCells).map((patch) => patch.rowPkTuple),
    ...Object.values(pendingDeleteRows).map((row) => row.rowPkTuple),
  ]);
}

export function mergeFetchedBatchIntoResponse(input: {
  response: QueryExecutionResponse;
  batchIndex: number;
  moreBatch: DbQueryBatchResult;
  protectedRowPkTuples: Set<string>;
  windowLimit: number;
}): MergeFetchedBatchResult {
  let droppedRows = 0;
  const batches = input.response.batches.map((batch, index) => {
    if (index !== input.batchIndex) return batch;
    const merged = mergeFetchedRowsIntoBatch(
      batch,
      input.moreBatch,
      input.protectedRowPkTuples,
      input.windowLimit,
    );
    droppedRows = merged.droppedRows;
    return merged.batch;
  });

  return {
    response: {
      ...input.response,
      batches,
    },
    droppedRows,
  };
}

export function buildResultWindowCappedNotice(
  windowLimit: number,
): LoadMoreNotice {
  return {
    title: "Result window capped",
    description: `Older loaded rows were released to keep this result within the ${windowLimit.toLocaleString()} row memory window.`,
    variant: "default",
  };
}

export function buildLoadMoreFailureNotice(message: string): LoadMoreNotice {
  return {
    title: "Load more failed",
    description: message,
    variant: "destructive",
  };
}
