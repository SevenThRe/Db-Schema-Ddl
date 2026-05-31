import type { DbDriver } from "@shared/schema";
import { quoteIdentifier } from "./table-designer-model";
import { formatSqlValue } from "./result-sql-export";

// "Copy as SQL statement" generators (Navicat right-click). Pure and
// driver-aware. Each accepts optional concrete values: when supplied the
// statement is runnable (real literals); otherwise it emits `?` placeholders
// for a prepared statement.

type Cell = string | number | boolean | null;

function qualified(table: string, driver: DbDriver, schemaName?: string): string {
  const quoted = quoteIdentifier(table, driver);
  const schema = schemaName?.trim();
  return schema ? `${quoteIdentifier(schema, driver)}.${quoted}` : quoted;
}

function literalOrPlaceholder(
  value: Cell | undefined,
  driver: DbDriver,
): string {
  return value === undefined ? "?" : formatSqlValue(value, driver);
}

export function buildSelectStatement(
  table: string,
  columns: string[],
  driver: DbDriver,
  options: { schemaName?: string; limit?: number } = {},
): string {
  const colList =
    columns.length > 0
      ? columns.map((c) => quoteIdentifier(c, driver)).join(", ")
      : "*";
  const limit =
    options.limit !== undefined ? ` LIMIT ${Math.max(0, Math.trunc(options.limit))}` : "";
  return `SELECT ${colList} FROM ${qualified(table, driver, options.schemaName)}${limit};`;
}

export function buildInsertStatement(
  table: string,
  columns: string[],
  driver: DbDriver,
  options: { schemaName?: string; values?: Cell[] } = {},
): string {
  const colList = columns.map((c) => quoteIdentifier(c, driver)).join(", ");
  const values = columns
    .map((_, index) => literalOrPlaceholder(options.values?.[index], driver))
    .join(", ");
  return `INSERT INTO ${qualified(table, driver, options.schemaName)} (${colList}) VALUES (${values});`;
}

export function buildUpdateStatement(
  table: string,
  setColumns: string[],
  pkColumns: string[],
  driver: DbDriver,
  options: { schemaName?: string; setValues?: Cell[]; pkValues?: Cell[] } = {},
): string {
  const setClause = setColumns
    .map(
      (column, index) =>
        `${quoteIdentifier(column, driver)} = ${literalOrPlaceholder(options.setValues?.[index], driver)}`,
    )
    .join(", ");
  const whereClause = pkColumns
    .map(
      (column, index) =>
        `${quoteIdentifier(column, driver)} = ${literalOrPlaceholder(options.pkValues?.[index], driver)}`,
    )
    .join(" AND ");
  return `UPDATE ${qualified(table, driver, options.schemaName)} SET ${setClause} WHERE ${whereClause};`;
}

export function buildDeleteStatement(
  table: string,
  pkColumns: string[],
  driver: DbDriver,
  options: { schemaName?: string; pkValues?: Cell[] } = {},
): string {
  const whereClause = pkColumns
    .map(
      (column, index) =>
        `${quoteIdentifier(column, driver)} = ${literalOrPlaceholder(options.pkValues?.[index], driver)}`,
    )
    .join(" AND ");
  return `DELETE FROM ${qualified(table, driver, options.schemaName)} WHERE ${whereClause};`;
}
