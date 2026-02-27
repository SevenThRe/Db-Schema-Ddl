import type { GenerateDdlRequest, TableInfo } from "@shared/schema";
import type { ValidationIssueCode } from "@shared/error-codes";

export interface DdlValidationIssue {
  issueCode: ValidationIssueCode;
  tableName: string;
  columnName?: string;
  field: "tableName" | "columnName" | "dataType" | "size" | "columns";
  message: string;
  value?: string;
  suggestion?: string;
  params?: Record<string, string | number>;
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INTEGER_SIZE_PATTERN = /^\d+$/;
const NUMERIC_SIZE_PATTERN = /^\d+(?:\s*,\s*\d+)?$/;
const DATA_TYPE_WITH_PARAMS_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^()]+)\))?$/;

const SUPPORTED_DATA_TYPES = new Set([
  "varchar",
  "char",
  "tinyint",
  "smallint",
  "int",
  "integer",
  "bigint",
  "date",
  "datetime",
  "timestamp",
  "text",
  "longtext",
  "mediumtext",
  "decimal",
  "numeric",
  "float",
  "double",
  "boolean",
  "bool",
  "blob",
  "json",
]);

const SIZE_RULES: Record<string, "none" | "integer" | "numeric"> = {
  varchar: "integer",
  char: "integer",
  tinyint: "integer",
  smallint: "integer",
  int: "integer",
  integer: "integer",
  bigint: "integer",
  date: "none",
  datetime: "integer",
  timestamp: "integer",
  text: "none",
  longtext: "none",
  mediumtext: "none",
  decimal: "numeric",
  numeric: "numeric",
  float: "numeric",
  double: "numeric",
  boolean: "none",
  bool: "none",
  blob: "none",
  json: "none",
};

function normalizeToken(value?: string): string {
  return (value ?? "").trim();
}

function normalizeDataType(value?: string): string {
  return normalizeToken(value).toLowerCase();
}

interface ParsedDataTypeSpec {
  rawType: string;
  baseType: string;
  inlineSize: string;
}

function parseDataTypeSpec(rawType: string): ParsedDataTypeSpec | null {
  const normalizedRawType = rawType
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .trim();
  const matched = normalizedRawType.match(DATA_TYPE_WITH_PARAMS_PATTERN);
  if (!matched) {
    return null;
  }
  const baseType = normalizeDataType(matched[1]);
  const inlineSize = normalizeToken(matched[2]);
  return {
    rawType: normalizedRawType,
    baseType,
    inlineSize,
  };
}

export function normalizeDataTypeAndSize(dataType?: string, size?: string): { type?: string; size?: string } {
  const rawType = normalizeToken(dataType);
  const rawSize = normalizeToken(size);
  if (rawType === "") {
    return {
      type: undefined,
      size: rawSize || undefined,
    };
  }

  const parsed = parseDataTypeSpec(rawType);
  if (!parsed) {
    return {
      type: rawType,
      size: rawSize || undefined,
    };
  }

  return {
    type: parsed.baseType,
    size: rawSize || parsed.inlineSize || undefined,
  };
}

function isSafeIdentifier(value?: string): boolean {
  return IDENTIFIER_PATTERN.test(normalizeToken(value));
}

function isEmpty(value?: string): boolean {
  return normalizeToken(value) === "";
}

function appendIssue(issues: DdlValidationIssue[], issue: DdlValidationIssue): void {
  issues.push(issue);
}

function validateIdentifiers(table: TableInfo, issues: DdlValidationIssue[]): void {
  if (!isSafeIdentifier(table.physicalTableName)) {
    appendIssue(issues, {
      issueCode: "INVALID_TABLE_NAME",
      tableName: table.physicalTableName || "(empty)",
      field: "tableName",
      value: table.physicalTableName ?? "",
      message: `Invalid table physical name "${table.physicalTableName ?? ""}"`,
      suggestion: "Use SQL-safe identifier pattern [A-Za-z_][A-Za-z0-9_]*.",
      params: {
        tableName: table.physicalTableName ?? "",
      },
    });
  }

  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    appendIssue(issues, {
      issueCode: "EMPTY_COLUMNS",
      tableName: table.physicalTableName || "(empty)",
      field: "columns",
      message: "Table does not contain any column definitions.",
      suggestion: "Ensure the selected range includes parsed column rows.",
      params: {
        tableName: table.physicalTableName || "(empty)",
      },
    });
    return;
  }

  const seenColumns = new Set<string>();
  table.columns.forEach((column) => {
    const columnName = normalizeToken(column.physicalName);
    if (!isSafeIdentifier(columnName)) {
      appendIssue(issues, {
        issueCode: "INVALID_COLUMN_NAME",
        tableName: table.physicalTableName || "(empty)",
        columnName: columnName || "(empty)",
        field: "columnName",
        value: column.physicalName ?? "",
        message: `Invalid column physical name "${column.physicalName ?? ""}"`,
        suggestion: "Use SQL-safe identifier pattern [A-Za-z_][A-Za-z0-9_]*.",
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName: column.physicalName ?? "",
        },
      });
      return;
    }

    const dedupeKey = columnName.toLowerCase();
    if (seenColumns.has(dedupeKey)) {
      appendIssue(issues, {
        issueCode: "DUPLICATE_COLUMN_NAME",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "columnName",
        value: columnName,
        message: `Duplicate column physical name "${columnName}" detected.`,
        suggestion: "Rename duplicated columns before generating DDL.",
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
        },
      });
      return;
    }
    seenColumns.add(dedupeKey);
  });
}

function validateDataType(table: TableInfo, issues: DdlValidationIssue[]): void {
  table.columns.forEach((column) => {
    const columnName = normalizeToken(column.physicalName) || "(empty)";
    const rawDataType = normalizeToken(column.dataType);
    const rawSize = normalizeToken(column.size);

    if (isEmpty(rawDataType)) {
      appendIssue(issues, {
        issueCode: "MISSING_DATA_TYPE",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "dataType",
        message: "Column data type is required.",
        suggestion: "Specify a supported SQL data type.",
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
        },
      });
      return;
    }

    const parsed = parseDataTypeSpec(rawDataType);
    if (!parsed) {
      appendIssue(issues, {
        issueCode: "UNSUPPORTED_DATA_TYPE",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "dataType",
        value: rawDataType,
        message: `Unsupported data type "${rawDataType}".`,
        suggestion: "Use one of the supported data types in the DDL generator.",
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
          dataType: rawDataType,
        },
      });
      return;
    }

    if (!SUPPORTED_DATA_TYPES.has(parsed.baseType)) {
      appendIssue(issues, {
        issueCode: "UNSUPPORTED_DATA_TYPE",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "dataType",
        value: rawDataType,
        message: `Unsupported data type "${rawDataType}".`,
        suggestion: "Use one of the supported data types in the DDL generator.",
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
          dataType: rawDataType,
        },
      });
      return;
    }

    if (rawSize !== "" && parsed.inlineSize !== "" && rawSize !== parsed.inlineSize) {
      appendIssue(issues, {
        issueCode: "CONFLICTING_SIZE_DEFINITIONS",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "size",
        value: `${rawDataType} + size=${rawSize}`,
        message: `Conflicting size definitions found in dataType "${rawDataType}" and size "${rawSize}".`,
        suggestion: "Keep size in one place, or make both values equal.",
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
          dataType: rawDataType,
          size: rawSize,
        },
      });
      return;
    }

    const effectiveSize = rawSize || parsed.inlineSize;
    if (effectiveSize === "") {
      return;
    }

    if (!NUMERIC_SIZE_PATTERN.test(effectiveSize)) {
      appendIssue(issues, {
        issueCode: "INVALID_SIZE_FORMAT",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "size",
        value: effectiveSize,
        message: `Invalid size format "${effectiveSize}".`,
        suggestion: 'Use integer ("10") or numeric pair ("10,2").',
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
          size: effectiveSize,
        },
      });
      return;
    }

    const sizeRule = SIZE_RULES[parsed.baseType];
    if (sizeRule === "none") {
      appendIssue(issues, {
        issueCode: "TYPE_MUST_NOT_INCLUDE_SIZE",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "size",
        value: effectiveSize,
        message: `Type "${rawDataType}" must not include size.`,
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
          dataType: rawDataType,
          size: effectiveSize,
        },
      });
      return;
    }

    if (sizeRule === "integer" && !INTEGER_SIZE_PATTERN.test(effectiveSize)) {
      appendIssue(issues, {
        issueCode: "TYPE_ONLY_ACCEPTS_INTEGER_SIZE",
        tableName: table.physicalTableName || "(empty)",
        columnName,
        field: "size",
        value: effectiveSize,
        message: `Type "${rawDataType}" only accepts integer size.`,
        params: {
          tableName: table.physicalTableName || "(empty)",
          columnName,
          dataType: rawDataType,
          size: effectiveSize,
        },
      });
    }
  });
}

function buildValidationMessage(issues: DdlValidationIssue[]): string {
  if (issues.length === 0) {
    return "DDL validation failed.";
  }

  const first = issues[0];
  const location = first.columnName
    ? `table "${first.tableName}", column "${first.columnName}"`
    : `table "${first.tableName}"`;
  return `DDL validation failed with ${issues.length} issue(s). First issue at ${location}: ${first.message}`;
}

export class DdlValidationError extends Error {
  readonly issues: DdlValidationIssue[];

  constructor(issues: DdlValidationIssue[]) {
    super(buildValidationMessage(issues));
    this.name = "DdlValidationError";
    this.issues = issues;
  }
}

export function validateGenerateDdlRequest(
  request: Pick<GenerateDdlRequest, "tables" | "dialect">,
): void {
  const issues: DdlValidationIssue[] = [];
  const seenTables = new Set<string>();

  request.tables.forEach((table) => {
    const tableName = normalizeToken(table.physicalTableName);
    if (!isEmpty(tableName)) {
      const dedupeKey = tableName.toLowerCase();
      if (seenTables.has(dedupeKey)) {
        appendIssue(issues, {
          issueCode: "DUPLICATE_TABLE_NAME",
          tableName,
          field: "tableName",
          value: tableName,
          message: `Duplicate table physical name "${tableName}" detected.`,
          suggestion: "Rename duplicated tables before generating DDL.",
          params: {
            tableName,
          },
        });
      } else {
        seenTables.add(dedupeKey);
      }
    }

    validateIdentifiers(table, issues);
    validateDataType(table, issues);
  });

  if (issues.length > 0) {
    throw new DdlValidationError(issues);
  }
}
