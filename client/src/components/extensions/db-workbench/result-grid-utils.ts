import type {
  DbConnectionConfig,
  DbQueryBatchResult,
  DbQueryRow,
} from "@shared/schema";

export function quoteIdentifier(driver: DbConnectionConfig["driver"], identifier: string): string {
  if (driver === "mysql") {
    return `\`${identifier.replace(/`/g, "``")}\``;
  }
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

export function formatRowPkValue(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function isCellValueEqual(
  left: string | number | boolean | null,
  right: string | number | boolean | null,
): boolean {
  return left === right;
}

export function buildRowPrimaryKey(
  row: DbQueryRow,
  batch: DbQueryBatchResult,
  primaryKeyColumns: string[],
): Record<string, string | number | boolean | null> | null {
  const rowPrimaryKey: Record<string, string | number | boolean | null> = {};
  for (const primaryKeyColumn of primaryKeyColumns) {
    const columnIndex = batch.columns.findIndex((column) => column.name === primaryKeyColumn);
    if (columnIndex < 0) return null;
    rowPrimaryKey[primaryKeyColumn] = row.values[columnIndex] ?? null;
  }
  return rowPrimaryKey;
}

export function buildRowPkTuple(
  rowPrimaryKey: Record<string, string | number | boolean | null>,
  primaryKeyColumns: string[],
): string {
  return primaryKeyColumns
    .map((column) => `${column}=${formatRowPkValue(rowPrimaryKey[column] ?? null)}`)
    .join("|");
}

export function getLoadedRowOffset(batch: DbQueryBatchResult): number {
  const offset = batch.loadedRowOffset;
  if (typeof offset !== "number" || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}

export function getLoadedRowCount(batch: DbQueryBatchResult): number {
  const explicit = batch.loadedRowCount;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.max(0, Math.trunc(explicit));
  }
  return Math.max(batch.rows.length, Math.trunc(batch.returnedRows || 0));
}

export function trimRowsForMemory(
  batch: DbQueryBatchResult,
  rows: DbQueryRow[],
  protectedRowPkTuples: Set<string>,
  limit: number,
): { rows: DbQueryRow[]; droppedRows: number } {
  const overflow = rows.length - limit;
  if (overflow <= 0) {
    return { rows, droppedRows: 0 };
  }

  const primaryKeyColumns = batch.primaryKeyColumns ?? [];
  if (primaryKeyColumns.length === 0 || protectedRowPkTuples.size === 0) {
    return {
      rows: rows.slice(overflow),
      droppedRows: overflow,
    };
  }

  let droppedRows = 0;
  const retainedRows: DbQueryRow[] = [];

  for (const row of rows) {
    if (droppedRows < overflow) {
      const rowPrimaryKey = buildRowPrimaryKey(row, batch, primaryKeyColumns);
      const rowPkTuple = rowPrimaryKey
        ? buildRowPkTuple(rowPrimaryKey, primaryKeyColumns)
        : null;
      if (!rowPkTuple || !protectedRowPkTuples.has(rowPkTuple)) {
        droppedRows += 1;
        continue;
      }
    }

    retainedRows.push(row);
  }

  return {
    rows: retainedRows,
    droppedRows,
  };
}

export function getCurrentPageRows(batch: DbQueryBatchResult): DbQueryRow[] {
  if (batch.rows.length === 0) {
    return [];
  }

  const currentPageSize = Math.max(
    1,
    Math.min(batch.rows.length, Math.trunc(batch.returnedRows || 0)),
  );
  return batch.rows.slice(batch.rows.length - currentPageSize);
}

export function mergeFetchedRowsIntoBatch(
  batch: DbQueryBatchResult,
  moreBatch: DbQueryBatchResult,
  protectedRowPkTuples: Set<string>,
  windowLimit: number,
): { batch: DbQueryBatchResult; droppedRows: number } {
  const mergedRows = [...batch.rows, ...moreBatch.rows];
  const priorLoadedOffset = getLoadedRowOffset(batch);
  const priorLoadedCount = getLoadedRowCount(batch);
  const loadedRowCount =
    priorLoadedCount +
    Math.max(moreBatch.rows.length, Math.trunc(moreBatch.returnedRows || 0));
  const trimmed =
    batch.pagingMode === "offset"
      ? trimRowsForMemory(batch, mergedRows, protectedRowPkTuples, windowLimit)
      : { rows: mergedRows, droppedRows: 0 };

  return {
    batch: {
      ...batch,
      rows: trimmed.rows,
      loadedRowOffset: priorLoadedOffset + trimmed.droppedRows,
      loadedRowCount,
      rowWindowTruncated:
        batch.rowWindowTruncated === true || trimmed.droppedRows > 0
          ? true
          : undefined,
      totalRows: moreBatch.totalRows ?? batch.totalRows,
      returnedRows: moreBatch.returnedRows,
      hasMore: moreBatch.hasMore,
      pagingMode: moreBatch.pagingMode,
      pagingReason: moreBatch.pagingReason,
      nextOffset: moreBatch.nextOffset,
      schema: moreBatch.schema ?? batch.schema,
      elapsedMs: batch.elapsedMs + moreBatch.elapsedMs,
    },
    droppedRows: trimmed.droppedRows,
  };
}
