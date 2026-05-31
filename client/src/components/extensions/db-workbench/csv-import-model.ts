import type { DbDriver } from "@shared/schema";
import { parseCsv, type ParseCsvOptions } from "./csv-parse";
import {
  buildCreateTableDdl,
  type TableDraft,
  type TableDraftColumn,
} from "./table-designer-model";
import { buildInsertScript } from "./result-sql-export";

// Data import: turn CSV into an executable plan — an optional CREATE TABLE with
// inferred column types, plus the INSERT script. Pure and driver-aware; the
// generated SQL is the same shape proven live against MySQL in db-live-verify.

export type CsvColumnKind = "integer" | "decimal" | "datetime" | "boolean" | "text";

const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+\.\d+$/;
const DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}([ tT]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(z|[+-]\d{2}:?\d{2})?)?$/i;
const BOOLEAN_RE = /^(true|false)$/i;

function classifyValue(value: string): CsvColumnKind | "empty" {
  const trimmed = value.trim();
  if (trimmed === "") return "empty";
  if (INTEGER_RE.test(trimmed)) return "integer";
  if (DECIMAL_RE.test(trimmed)) return "decimal";
  if (BOOLEAN_RE.test(trimmed)) return "boolean";
  if (DATETIME_RE.test(trimmed)) return "datetime";
  return "text";
}

/** Infer a column's kind from its sample values (most permissive wins). */
export function inferCsvColumnKind(values: string[]): CsvColumnKind {
  let sawInteger = false;
  let sawDecimal = false;
  let sawDatetime = false;
  let sawBoolean = false;
  let sawAny = false;

  for (const value of values) {
    const kind = classifyValue(value);
    if (kind === "empty") continue;
    sawAny = true;
    if (kind === "text") return "text";
    if (kind === "integer") sawInteger = true;
    else if (kind === "decimal") sawDecimal = true;
    else if (kind === "datetime") sawDatetime = true;
    else if (kind === "boolean") sawBoolean = true;
  }

  if (!sawAny) return "text";
  // A column mixing kinds (other than int+decimal) degrades to text.
  const distinct = [sawInteger || sawDecimal, sawDatetime, sawBoolean].filter(
    Boolean,
  ).length;
  if (distinct > 1) return "text";
  if (sawDatetime) return "datetime";
  if (sawBoolean) return "boolean";
  if (sawDecimal) return "decimal";
  if (sawInteger) return "integer";
  return "text";
}

function maxLength(values: string[]): number {
  return values.reduce((max, value) => Math.max(max, value.trim().length), 0);
}

export function csvKindToType(
  kind: CsvColumnKind,
  driver: DbDriver,
  textLength: number,
): string {
  switch (kind) {
    case "integer":
      return driver === "mysql" ? "int" : "integer";
    case "decimal":
      return driver === "mysql" ? "decimal(18,6)" : "numeric(18,6)";
    case "datetime":
      return driver === "mysql" ? "datetime" : "timestamptz";
    case "boolean":
      return driver === "mysql" ? "tinyint(1)" : "boolean";
    case "text":
    default: {
      if (textLength === 0) return driver === "mysql" ? "varchar(255)" : "varchar(255)";
      if (textLength > 255) return "text";
      // Round up to a sensible width with headroom.
      const width = Math.min(255, Math.max(1, Math.ceil(textLength * 1.2)));
      return `varchar(${width})`;
    }
  }
}

export interface CsvImportColumn {
  name: string;
  kind: CsvColumnKind;
  dataType: string;
}

/** Infer target columns (name + type) for a CREATE-from-CSV. */
export function inferCsvImportColumns(
  headers: string[],
  rows: string[][],
  driver: DbDriver,
): CsvImportColumn[] {
  return headers.map((header, index) => {
    const columnValues = rows.map((row) => row[index] ?? "");
    const kind = inferCsvColumnKind(columnValues);
    return {
      name: header.trim() || `column_${index + 1}`,
      kind,
      dataType: csvKindToType(kind, driver, maxLength(columnValues)),
    };
  });
}

export interface CsvImportPlan {
  columns: CsvImportColumn[];
  rowCount: number;
  createDdl: string | null;
  insertScript: string;
}

export interface BuildCsvImportPlanOptions extends ParseCsvOptions {
  driver: DbDriver;
  tableName: string;
  schemaName?: string;
  /** Emit a CREATE TABLE with inferred types before the INSERTs. */
  createTable?: boolean;
  batchSize?: number;
}

/**
 * Parse CSV and build an import plan. Empty cells become NULL (so blanks are
 * valid for typed columns); column types are inferred when createTable is set.
 */
export function buildCsvImportPlan(
  csvText: string,
  options: BuildCsvImportPlanOptions,
): CsvImportPlan {
  const parsed = parseCsv(csvText, {
    delimiter: options.delimiter,
    hasHeader: options.hasHeader,
  });
  const columns = inferCsvImportColumns(parsed.headers, parsed.rows, options.driver);

  // Coerce cells to typed values by inferred kind so the INSERT emits clean
  // literals (1 not '1', TRUE not 'true'); blanks become NULL. Integers/decimals
  // are kept as strings when a numeric round-trip would lose precision (e.g.
  // bigint ids), since a quoted numeric literal still inserts correctly.
  const valueRows: (string | number | boolean | null)[][] = parsed.rows.map((row) =>
    columns.map((column, index) => {
      const cell = row[index];
      if (cell === undefined) return null;
      const trimmed = cell.trim();
      if (trimmed === "") return null;

      switch (column.kind) {
        case "integer": {
          const n = Number(trimmed);
          return Number.isSafeInteger(n) && String(n) === trimmed ? n : trimmed;
        }
        case "decimal": {
          const n = Number(trimmed);
          return Number.isFinite(n) && String(n) === trimmed ? n : trimmed;
        }
        case "boolean":
          return /^true$/i.test(trimmed)
            ? true
            : /^false$/i.test(trimmed)
              ? false
              : trimmed;
        default:
          return cell;
      }
    }),
  );

  const insertScript = buildInsertScript({
    driver: options.driver,
    tableName: options.tableName,
    schemaName: options.schemaName,
    columns: columns.map((column) => ({ name: column.name })),
    rows: valueRows,
    batchSize: options.batchSize,
  });

  let createDdl: string | null = null;
  if (options.createTable) {
    const draftColumns: TableDraftColumn[] = columns.map((column, index) => ({
      id: `csv-${index}`,
      name: column.name,
      dataType: column.dataType,
      nullable: true,
      primaryKey: false,
    }));
    const draft: TableDraft = { name: options.tableName, columns: draftColumns };
    createDdl = buildCreateTableDdl(draft, options.driver, options.schemaName);
  }

  return {
    columns,
    rowCount: parsed.rows.length,
    createDdl,
    insertScript,
  };
}
