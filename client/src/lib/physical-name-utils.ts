import type { TableInfo } from "@shared/schema";

export const PHYSICAL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const CAMEL_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/g;
const NON_ALNUM_UNDERSCORE_PATTERN = /[^A-Za-z0-9_]+/g;
const MULTIPLE_UNDERSCORE_PATTERN = /_+/g;
const EDGE_UNDERSCORE_PATTERN = /^_+|_+$/g;

export interface ColumnNameIssue {
  columnIndex: number;
  currentName: string;
  suggestedName: string;
}

export interface TableNameValidation {
  hasIssues: boolean;
  hasInvalidTableName: boolean;
  tableNameCurrent: string;
  tableNameSuggested: string;
  invalidColumns: ColumnNameIssue[];
}

export function isValidPhysicalName(name?: string): boolean {
  if (!name) return false;
  return PHYSICAL_NAME_PATTERN.test(name.trim());
}

export function normalizePhysicalName(name?: string, fallback = "unnamed"): string {
  const raw = (name ?? "").trim();

  if (!raw) {
    return fallback;
  }

  let normalized = raw
    .replace(CAMEL_BOUNDARY_PATTERN, "$1_$2")
    .replace(NON_ALNUM_UNDERSCORE_PATTERN, "_")
    .toLowerCase()
    .replace(MULTIPLE_UNDERSCORE_PATTERN, "_")
    .replace(EDGE_UNDERSCORE_PATTERN, "");

  if (!normalized) {
    normalized = fallback;
  }

  if (/^\d/.test(normalized)) {
    normalized = `t_${normalized}`;
  }

  return normalized;
}

export function validateTablePhysicalNames(table: TableInfo): TableNameValidation {
  const tableNameCurrent = table.physicalTableName ?? "";
  const tableNameSuggested = normalizePhysicalName(
    tableNameCurrent || table.logicalTableName,
    "unnamed_table",
  );
  const hasInvalidTableName = !isValidPhysicalName(tableNameCurrent);

  const invalidColumns: ColumnNameIssue[] = table.columns
    .map((column, columnIndex) => {
      const currentName = (column.physicalName ?? "").trim();
      const suggestedName = normalizePhysicalName(
        currentName || column.logicalName || `column_${columnIndex + 1}`,
        `column_${columnIndex + 1}`,
      );

      if (isValidPhysicalName(currentName)) {
        return null;
      }

      return {
        columnIndex,
        currentName,
        suggestedName,
      };
    })
    .filter((item): item is ColumnNameIssue => item !== null);

  return {
    hasIssues: hasInvalidTableName || invalidColumns.length > 0,
    hasInvalidTableName,
    tableNameCurrent,
    tableNameSuggested,
    invalidColumns,
  };
}

export function autoFixTablePhysicalNames(table: TableInfo): TableInfo {
  const validation = validateTablePhysicalNames(table);
  if (!validation.hasIssues) {
    return table;
  }

  return {
    ...table,
    physicalTableName: validation.hasInvalidTableName
      ? validation.tableNameSuggested
      : table.physicalTableName,
    columns: table.columns.map((column, columnIndex) => {
      const columnIssue = validation.invalidColumns.find(
        (issue) => issue.columnIndex === columnIndex,
      );

      if (!columnIssue) {
        return column;
      }

      return {
        ...column,
        physicalName: columnIssue.suggestedName,
      };
    }),
  };
}
