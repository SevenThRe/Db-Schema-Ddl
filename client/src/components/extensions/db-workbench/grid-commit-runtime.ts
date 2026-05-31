import type {
  DbGridCommitRequest,
  DbGridCommitResponse,
  DbGridEditSource,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
} from "@shared/schema";
import {
  hasPendingGridCommitDrafts,
  type PendingGridCommitDrafts,
} from "./grid-edit-drafts";

export type GridCommitNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type GridPrepareBuildResult =
  | { request: DbGridPrepareCommitRequest; notice?: undefined }
  | { request?: undefined; notice: GridCommitNotice };

export type GridCommitResultAction = {
  rolledBack: boolean;
  clearDrafts: boolean;
  refreshTable: boolean;
  notice: GridCommitNotice;
};

export function buildPrepareGridCommitRequest(input: {
  connectionId: string;
  runtimeSchema?: string | null;
  activeBatch: DbQueryBatchResult;
  fallbackSource: DbGridEditSource | null;
  drafts: PendingGridCommitDrafts;
}): GridPrepareBuildResult {
  if (input.activeBatch.editEligibility?.eligible !== true) {
    return {
      notice: {
        title: "Cannot prepare commit",
        description:
          input.activeBatch.editEligibility?.reasons[0]?.message ??
          "Current batch is read-only for safe editing.",
        variant: "destructive",
      },
    };
  }

  const source = input.activeBatch.editSource ?? input.fallbackSource;
  const tableName = source?.tableName?.trim();
  if (!source || !tableName) {
    return {
      notice: {
        title: "Cannot prepare commit",
        description: "Editable source table context is missing.",
        variant: "destructive",
      },
    };
  }

  const primaryKeyColumns = input.activeBatch.primaryKeyColumns ?? [];
  if (primaryKeyColumns.length === 0) {
    return {
      notice: {
        title: "Cannot prepare commit",
        description: "Primary key columns are missing for this editable batch.",
        variant: "destructive",
      },
    };
  }

  if (!hasPendingGridCommitDrafts(input.drafts)) {
    return {
      notice: {
        title: "No pending changes",
        description: "Stage at least one row edit, insert draft, or delete before preparing commit.",
        variant: "default",
      },
    };
  }

  return {
    request: {
      connectionId: input.connectionId,
      schema: input.runtimeSchema ?? undefined,
      tableName,
      source,
      primaryKeyColumns,
      patchCells: input.drafts.patchCells,
      deletedRows: input.drafts.deletedRows,
      insertedRows: input.drafts.insertedRows,
    },
  };
}

export function buildPrepareGridCommitSuccessNotice(
  prepared: DbGridPrepareCommitResponse,
): GridCommitNotice {
  return {
    title: "Commit plan prepared",
    description: `${prepared.insertedRows} inserts, ${prepared.updatedRows} updates, and ${prepared.deletedRows} deletes ready for review.`,
    variant: "success",
  };
}

export function buildPrepareGridCommitFailureNotice(
  message: string,
): GridCommitNotice {
  return {
    title: "Prepare commit failed",
    description: message,
    variant: "destructive",
  };
}

export function buildGridCommitRequest(input: {
  connectionId: string;
  preparedPlan: DbGridPrepareCommitResponse;
}): DbGridCommitRequest {
  return {
    connectionId: input.connectionId,
    planId: input.preparedPlan.planId,
    planHash: input.preparedPlan.planHash,
  };
}

export function resolveGridCommitResultAction(
  result: DbGridCommitResponse,
  shouldRefreshTable: boolean,
): GridCommitResultAction {
  if (typeof result.failedSqlIndex === "number") {
    return {
      rolledBack: true,
      clearDrafts: false,
      refreshTable: false,
      notice: {
        title: "Commit rolled back",
        description:
          result.message ??
          `Statement ${result.failedSqlIndex + 1} failed and the transaction was rolled back.`,
        variant: "destructive",
      },
    };
  }

  return {
    rolledBack: false,
    clearDrafts: true,
    refreshTable: shouldRefreshTable,
    notice: {
      title: "Commit applied",
      description: `${result.insertedRows} inserts, ${result.updatedRows} updates, and ${result.deletedRows} deletes committed.`,
      variant: "success",
    },
  };
}

export function buildGridCommitFailureNotice(message: string): GridCommitNotice {
  return {
    title: "Commit failed",
    description: message,
    variant: "destructive",
  };
}
