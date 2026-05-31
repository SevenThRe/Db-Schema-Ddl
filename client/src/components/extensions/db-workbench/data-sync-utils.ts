import type {
  DbDataApplySelection,
  DbDataDiffDetailResponse,
  DbDataDiffTableRequest,
  DbDataSyncBlockerCode,
  DbSchemaSnapshot,
  DbTableSchema,
} from "@shared/schema";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import { formatWorkbenchError } from "./workbench-errors";
import { normalizeIdentifierList } from "./workbench-collection-utils";

export type SyncTableRuntimeMetadata = {
  availableColumns: string[];
  defaultKeyColumns: string[];
  defaultCompareColumns: string[];
  sourceExists: boolean;
  targetExists: boolean;
};

export type SyncTableConfigDraft = {
  keyColumnsText: string;
  compareColumnsText: string;
  whereClause: string;
};

export type SyncTableMetadataIndex = {
  tableNames: string[];
  metadataByName: Record<string, SyncTableRuntimeMetadata>;
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function collectPrimaryKeyColumns(table: DbTableSchema | null): string[] {
  if (!table) {
    return [];
  }
  return table.columns
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
}

function collectUniqueKeyColumns(table: DbTableSchema | null): string[] {
  if (!table) {
    return [];
  }
  const uniqueIndex = (table.indexes ?? []).find(
    (index) => index.unique && index.columns.length > 0,
  );
  return uniqueIndex?.columns ?? [];
}

function collectUnionColumnNames(
  sourceTable: DbTableSchema | null,
  targetTable: DbTableSchema | null,
): string[] {
  return uniqueStrings([
    ...(sourceTable?.columns.map((column) => column.name) ?? []),
    ...(targetTable?.columns.map((column) => column.name) ?? []),
  ]);
}

export function resolveRuntimeSyncMetadata(
  sourceTable: DbTableSchema | null,
  targetTable: DbTableSchema | null,
): SyncTableRuntimeMetadata {
  const availableColumns = collectUnionColumnNames(sourceTable, targetTable);
  const primaryKeyColumns = uniqueStrings([
    ...collectPrimaryKeyColumns(sourceTable),
    ...collectPrimaryKeyColumns(targetTable),
  ]);
  const defaultKeyColumns =
    primaryKeyColumns.length > 0
      ? primaryKeyColumns
      : uniqueStrings([
          ...collectUniqueKeyColumns(sourceTable),
          ...collectUniqueKeyColumns(targetTable),
        ]);
  const keyColumnSet = new Set(defaultKeyColumns);
  const defaultCompareColumns = availableColumns.filter(
    (column) => !keyColumnSet.has(column),
  );

  return {
    availableColumns,
    defaultKeyColumns,
    defaultCompareColumns,
    sourceExists: !!sourceTable,
    targetExists: !!targetTable,
  };
}

export function buildSyncTableMetadataIndex(
  sourceSnapshot: Pick<DbSchemaSnapshot, "tables"> | null,
  targetSnapshot: Pick<DbSchemaSnapshot, "tables"> | null,
): SyncTableMetadataIndex {
  const sourceTables = new Map<string, DbTableSchema>(
    (sourceSnapshot?.tables ?? []).map((table) => [table.name, table]),
  );
  const targetTables = new Map<string, DbTableSchema>(
    (targetSnapshot?.tables ?? []).map((table) => [table.name, table]),
  );
  const tableNames = uniqueStrings([
    ...Array.from(sourceTables.keys()),
    ...Array.from(targetTables.keys()),
  ]).sort((left, right) => left.localeCompare(right));

  return {
    tableNames,
    metadataByName: tableNames.reduce<Record<string, SyncTableRuntimeMetadata>>(
      (accumulator, tableName) => {
        accumulator[tableName] = resolveRuntimeSyncMetadata(
          sourceTables.get(tableName) ?? null,
          targetTables.get(tableName) ?? null,
        );
        return accumulator;
      },
      {},
    ),
  };
}

export function buildSyncSchemaIssueMessage(input: {
  sourceConnectionId: string;
  targetConnectionId: string;
  activeConnectionId: string;
  connectionCount: number;
  activeSchemaError: unknown;
  sourceSnapshotError: unknown;
  targetSnapshotError: unknown;
}): string | null {
  if (!input.sourceConnectionId || !input.targetConnectionId) {
    return "Select both source and target connections before compare.";
  }
  if (input.sourceConnectionId === input.targetConnectionId) {
    return input.connectionCount > 1
      ? "Source and target connections must be different for sync compare."
      : "Add a second saved connection before running sync compare.";
  }
  if (input.sourceConnectionId === input.activeConnectionId && input.activeSchemaError) {
    return formatWorkbenchError(
      input.activeSchemaError,
      "Failed to load source connection schema for sync compare.",
    );
  }
  if (input.targetConnectionId === input.activeConnectionId && input.activeSchemaError) {
    return formatWorkbenchError(
      input.activeSchemaError,
      "Failed to load target connection schema for sync compare.",
    );
  }
  if (input.sourceSnapshotError) {
    return formatWorkbenchError(
      input.sourceSnapshotError,
      "Failed to load source connection schema for sync compare.",
    );
  }
  if (input.targetSnapshotError) {
    return formatWorkbenchError(
      input.targetSnapshotError,
      "Failed to load target connection schema for sync compare.",
    );
  }
  return null;
}

export function resolveSyncSelectedTables(input: {
  currentSelectedTables: string[];
  availableTableNames: string[];
  selectedTableName: string | null;
}): string[] {
  if (input.availableTableNames.length === 0) {
    return [];
  }

  const filtered = input.currentSelectedTables.filter((name) =>
    input.availableTableNames.includes(name)
  );
  if (filtered.length > 0) {
    return filtered;
  }

  if (
    input.selectedTableName &&
    input.availableTableNames.includes(input.selectedTableName)
  ) {
    return [input.selectedTableName];
  }

  return [input.availableTableNames[0]];
}

export function pruneSyncTableConfigs(
  tableConfigs: Record<string, SyncTableConfigDraft>,
  availableTableNames: string[],
): Record<string, SyncTableConfigDraft> {
  const nextEntries = Object.entries(tableConfigs).filter(([tableName]) =>
    availableTableNames.includes(tableName)
  );

  if (nextEntries.length === Object.keys(tableConfigs).length) {
    return tableConfigs;
  }

  return Object.fromEntries(nextEntries);
}

export function hasBlockingDataSyncBlocker(
  blockers: { code: DbDataSyncBlockerCode }[] | undefined,
): boolean {
  if (!blockers || blockers.length === 0) return false;
  return blockers.some((blocker) =>
    blocker.code === "target_snapshot_changed" ||
    blocker.code === "artifact_expired" ||
    blocker.code === "readonly_target" ||
    blocker.code === "missing_stable_key" ||
    blocker.code === "unsafe_delete_confirmation_required" ||
    blocker.code === "target_database_confirmation_required"
  );
}

export function describeDataSyncBlocker(code: DbDataSyncBlockerCode): string {
  if (code === "target_snapshot_changed") {
    return "Target snapshot changed after compare. Re-run compare before execute.";
  }
  if (code === "artifact_expired") {
    return "Compare artifact expired. Re-run compare preview.";
  }
  if (code === "unsafe_delete_threshold") {
    return "Delete volume crossed unsafe_delete_threshold. Operator confirmation required.";
  }
  if (code === "unsafe_delete_confirmation_required") {
    return "Explicit unsafe delete confirmation is required before execute.";
  }
  if (code === "readonly_target") {
    return "Target connection is read-only and cannot apply changes.";
  }
  if (code === "target_database_confirmation_required") {
    return "Typed target database confirmation is required before execute.";
  }
  return "Missing stable key prevents deterministic row matching.";
}

export function formatDataSyncCounts(counts: {
  insert: number;
  update: number;
  delete: number;
  unchanged: number;
}): string {
  return `I:${counts.insert} U:${counts.update} D:${counts.delete} =:${counts.unchanged}`;
}

export function toDataSyncRowDiffEntry(
  detail: DbDataDiffDetailResponse,
): DataSyncRowDiffEntry[] {
  return detail.rows.map((row) => ({
    tableName: detail.tableName,
    rowKey: Object.fromEntries(
      Object.entries(row.rowKey).map(([key, value]) => {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          value === null
        ) {
          return [key, value];
        }
        return [key, String(value)];
      }),
    ),
    status: row.status,
    suggestedAction: row.suggestedAction,
    sourceRow: row.sourceRow,
    targetRow: row.targetRow,
    fieldDiffs: row.fieldDiffs.map((field) => ({
      columnName: field.columnName,
      sourceValue: field.sourceValue,
      targetValue: field.targetValue,
      changed: field.changed,
    })),
  }));
}

export function buildDataApplySelections(
  rows: DataSyncRowDiffEntry[],
): DbDataApplySelection[] {
  return rows
    .filter((row) => row.suggestedAction && row.suggestedAction !== "ignore")
    .map((row) => ({
      tableName: row.tableName,
      rowKey: row.rowKey,
      action:
        row.suggestedAction === "insert"
          ? "insert"
          : row.suggestedAction === "delete"
            ? "delete"
            : "update",
    }));
}

export function buildDataDiffTableRequests(
  tableNames: string[],
  tableConfigs: Record<string, Partial<SyncTableConfigDraft> | undefined>,
): DbDataDiffTableRequest[] {
  return tableNames.map((tableName) => {
    const config = tableConfigs[tableName];
    const keyColumns = normalizeIdentifierList(config?.keyColumnsText ?? "");
    const compareColumns = normalizeIdentifierList(config?.compareColumnsText ?? "");
    const whereClause = config?.whereClause?.trim();

    return {
      tableName,
      keyColumns: keyColumns.length > 0 ? keyColumns : undefined,
      compareColumns: compareColumns.length > 0 ? compareColumns : undefined,
      whereClause: whereClause ? whereClause : undefined,
    };
  });
}
