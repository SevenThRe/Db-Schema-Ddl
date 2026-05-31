import type { DbDriver } from "@shared/schema";
import { quoteIdentifier } from "./table-designer-model";

// Pure, driver-aware DDL generators for the common table maintenance operations
// exposed by Navicat-class right-click menus: drop, truncate, rename, and
// duplicate-structure. Destructive operations are flagged so the caller routes
// them through the existing dangerous-SQL confirmation gate.

export type TableOperationKind =
  | "drop"
  | "truncate"
  | "rename"
  | "duplicate-structure";

function qualified(name: string, driver: DbDriver, schemaName?: string): string {
  const table = quoteIdentifier(name, driver);
  const schema = schemaName?.trim();
  return schema ? `${quoteIdentifier(schema, driver)}.${table}` : table;
}

export function buildDropTableSql(
  table: string,
  driver: DbDriver,
  options: { ifExists?: boolean; schemaName?: string } = {},
): string {
  const ifExists = options.ifExists ? "IF EXISTS " : "";
  return `DROP TABLE ${ifExists}${qualified(table, driver, options.schemaName)};`;
}

export function buildTruncateTableSql(
  table: string,
  driver: DbDriver,
  schemaName?: string,
): string {
  return `TRUNCATE TABLE ${qualified(table, driver, schemaName)};`;
}

export function buildRenameTableSql(
  fromName: string,
  toName: string,
  driver: DbDriver,
  schemaName?: string,
): string {
  if (driver === "mysql") {
    // MySQL RENAME TABLE can carry schema qualifiers on both sides.
    return `RENAME TABLE ${qualified(fromName, driver, schemaName)} TO ${qualified(toName, driver, schemaName)};`;
  }
  // PostgreSQL renames in place; the new name is unqualified.
  return `ALTER TABLE ${qualified(fromName, driver, schemaName)} RENAME TO ${quoteIdentifier(toName, driver)};`;
}

export function buildDuplicateTableStructureSql(
  fromName: string,
  toName: string,
  driver: DbDriver,
  schemaName?: string,
): string {
  const from = qualified(fromName, driver, schemaName);
  const to = qualified(toName, driver, schemaName);
  if (driver === "mysql") {
    return `CREATE TABLE ${to} LIKE ${from};`;
  }
  return `CREATE TABLE ${to} (LIKE ${from} INCLUDING ALL);`;
}

/** Destructive ops must pass through dangerous-SQL confirmation before running. */
export function isDestructiveTableOperation(kind: TableOperationKind): boolean {
  return kind === "drop" || kind === "truncate" || kind === "rename";
}
