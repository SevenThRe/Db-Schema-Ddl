import type { DbDriver } from "@shared/schema";
import { quoteIdentifier } from "./table-designer-model";

// Pure "rows -> INSERT script" generation (Navicat's "Export/Copy as SQL").
// Operates on already-fetched grid data, so it needs no backend round-trip and
// is fully unit-testable. Value formatting and string escaping are driver-aware.

export interface SqlExportColumn {
  name: string;
}

export interface BuildInsertScriptOptions {
  driver: DbDriver;
  tableName: string;
  schemaName?: string;
  columns: SqlExportColumn[];
  /** Row tuples aligned with `columns` (DbQueryRow.values). */
  rows: (string | number | boolean | null)[][];
  /** Combine rows into multi-row VALUES (batched); default true. */
  multiRow?: boolean;
  /** Rows per INSERT when multiRow; default 100. */
  batchSize?: number;
}

function qualifiedTableName(
  table: string,
  driver: DbDriver,
  schemaName?: string,
): string {
  const quotedTable = quoteIdentifier(table, driver);
  const trimmedSchema = schemaName?.trim();
  return trimmedSchema
    ? `${quoteIdentifier(trimmedSchema, driver)}.${quotedTable}`
    : quotedTable;
}

/**
 * Escape a string for a single-quoted SQL literal. PostgreSQL (with the default
 * standard_conforming_strings=on) only needs single-quote doubling; MySQL also
 * treats backslash as an escape character by default, so backslashes are
 * doubled as well to keep the value byte-exact.
 */
export function escapeExportStringLiteral(value: string, driver: DbDriver): string {
  const singleQuoteSafe = value.replace(/'/g, "''");
  return driver === "mysql"
    ? singleQuoteSafe.replace(/\\/g, "\\\\")
    : singleQuoteSafe;
}

export function formatSqlValue(
  value: string | number | boolean | null,
  driver: DbDriver,
): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${escapeExportStringLiteral(String(value), driver)}'`;
}

export function buildInsertScript(options: BuildInsertScriptOptions): string {
  const { driver, columns, rows } = options;
  if (columns.length === 0 || rows.length === 0) {
    return "";
  }

  const table = qualifiedTableName(options.tableName, driver, options.schemaName);
  const columnList = columns
    .map((column) => quoteIdentifier(column.name, driver))
    .join(", ");

  const tuples = rows.map(
    (row) =>
      `(${columns.map((_, index) => formatSqlValue(row[index] ?? null, driver)).join(", ")})`,
  );

  const multiRow = options.multiRow ?? true;
  if (!multiRow) {
    return tuples
      .map((tuple) => `INSERT INTO ${table} (${columnList}) VALUES ${tuple};`)
      .join("\n");
  }

  const batchSize = Math.max(1, Math.trunc(options.batchSize ?? 100));
  const statements: string[] = [];
  for (let start = 0; start < tuples.length; start += batchSize) {
    const chunk = tuples.slice(start, start + batchSize);
    statements.push(
      `INSERT INTO ${table} (${columnList}) VALUES\n  ${chunk.join(",\n  ")};`,
    );
  }
  return statements.join("\n");
}
