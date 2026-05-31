import type { DbSchemaSnapshot } from "@shared/schema";
import {
  buildSyncSchemaIssueMessage,
  buildSyncTableMetadataIndex,
} from "./data-sync-utils";

export interface BuildWorkbenchSyncSchemaContextInput {
  activeConnectionId: string;
  connectionCount: number;
  activeSchemaSnapshot: DbSchemaSnapshot | null | undefined;
  activeSchemaError: unknown;
  sourceConnectionId: string;
  targetConnectionId: string;
  sourceSnapshotData: DbSchemaSnapshot | null | undefined;
  targetSnapshotData: DbSchemaSnapshot | null | undefined;
  sourceSnapshotError: unknown;
  targetSnapshotError: unknown;
  isSourceSnapshotLoading: boolean;
  isTargetSnapshotLoading: boolean;
}

export function buildWorkbenchSyncSchemaContext(
  input: BuildWorkbenchSyncSchemaContextInput,
) {
  const sourceSnapshot =
    input.sourceConnectionId === input.activeConnectionId
      ? input.activeSchemaSnapshot ?? null
      : input.sourceSnapshotData ?? null;
  const targetSnapshot =
    input.targetConnectionId === input.activeConnectionId
      ? input.activeSchemaSnapshot ?? null
      : input.targetSnapshotData ?? null;
  const tableMetadataIndex = buildSyncTableMetadataIndex(
    sourceSnapshot,
    targetSnapshot,
  );

  return {
    sourceSnapshot,
    targetSnapshot,
    tableMetadataIndex,
    availableTableNames: tableMetadataIndex.tableNames,
    issueMessage: buildSyncSchemaIssueMessage({
      sourceConnectionId: input.sourceConnectionId,
      targetConnectionId: input.targetConnectionId,
      activeConnectionId: input.activeConnectionId,
      connectionCount: input.connectionCount,
      activeSchemaError: input.activeSchemaError,
      sourceSnapshotError: input.sourceSnapshotError,
      targetSnapshotError: input.targetSnapshotError,
    }),
    isLoading:
      (input.sourceConnectionId !== input.activeConnectionId &&
        input.isSourceSnapshotLoading) ||
      (input.targetConnectionId !== input.activeConnectionId &&
        input.isTargetSnapshotLoading),
  };
}
