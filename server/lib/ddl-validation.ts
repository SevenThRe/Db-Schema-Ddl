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

interface ColumnValidationContext {
  tableName: string;
  columnName: string;
  rawDataType: string;
  rawSize: string;
}

function createColumnValidationContext(
  table: TableInfo,
  column: TableInfo["columns"][number],
): ColumnValidationContext {
  return {
    tableName: table.physicalTableName || "(empty)",
    columnName: normalizeToken(column.physicalName) || "(empty)",
    rawDataType: normalizeToken(column.dataType),
    rawSize: normalizeToken(column.size),
  };
}

function buildColumnIssueParams(
  context: ColumnValidationContext,
  extra: Record<string, string | number> = {},
): Record<string, string | number> {
  return {
    tableName: context.tableName,
    columnName: context.columnName,
    ...extra,
  };
}

function appendColumnIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
  issue: Omit<DdlValidationIssue, "tableName" | "columnName" | "params"> & {
    params?: Record<string, string | number>;
  },
): void {
  appendIssue(issues, {
    ...issue,
    tableName: context.tableName,
    columnName: context.columnName,
    params: issue.params,
  });
}

function appendMissingDataTypeIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
): void {
  appendColumnIssue(issues, context, {
    issueCode: "MISSING_DATA_TYPE",
    field: "dataType",
    message: "Column data type is required.",
    suggestion: "Specify a supported SQL data type.",
    params: buildColumnIssueParams(context),
  });
}

function appendUnsupportedDataTypeIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
): void {
  appendColumnIssue(issues, context, {
    issueCode: "UNSUPPORTED_DATA_TYPE",
    field: "dataType",
    value: context.rawDataType,
    message: `Unsupported data type "${context.rawDataType}".`,
    suggestion: "Use one of the supported data types in the DDL generator.",
    params: buildColumnIssueParams(context, {
      dataType: context.rawDataType,
    }),
  });
}

function appendConflictingSizeDefinitionsIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
): void {
  appendColumnIssue(issues, context, {
    issueCode: "CONFLICTING_SIZE_DEFINITIONS",
    field: "size",
    value: `${context.rawDataType} + size=${context.rawSize}`,
    message: `Conflicting size definitions found in dataType "${context.rawDataType}" and size "${context.rawSize}".`,
    suggestion: "Keep size in one place, or make both values equal.",
    params: buildColumnIssueParams(context, {
      dataType: context.rawDataType,
      size: context.rawSize,
    }),
  });
}

function appendInvalidSizeFormatIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
  effectiveSize: string,
): void {
  appendColumnIssue(issues, context, {
    issueCode: "INVALID_SIZE_FORMAT",
    field: "size",
    value: effectiveSize,
    message: `Invalid size format "${effectiveSize}".`,
    suggestion: 'Use integer ("10") or numeric pair ("10,2").',
    params: buildColumnIssueParams(context, {
      size: effectiveSize,
    }),
  });
}

function appendTypeMustNotIncludeSizeIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
  effectiveSize: string,
): void {
  appendColumnIssue(issues, context, {
    issueCode: "TYPE_MUST_NOT_INCLUDE_SIZE",
    field: "size",
    value: effectiveSize,
    message: `Type "${context.rawDataType}" must not include size.`,
    params: buildColumnIssueParams(context, {
      dataType: context.rawDataType,
      size: effectiveSize,
    }),
  });
}

function allowsCompatibilitySizeOne(baseType: string, effectiveSize: string): boolean {
  if ((baseType !== "boolean" && baseType !== "bool") || !INTEGER_SIZE_PATTERN.test(effectiveSize)) {
    return false;
  }

  return Number.parseInt(effectiveSize, 10) === 1;
}

function appendTypeOnlyAcceptsIntegerSizeIssue(
  issues: DdlValidationIssue[],
  context: ColumnValidationContext,
  effectiveSize: string,
): void {
  appendColumnIssue(issues, context, {
    issueCode: "TYPE_ONLY_ACCEPTS_INTEGER_SIZE",
    field: "size",
    value: effectiveSize,
    message: `Type "${context.rawDataType}" only accepts integer size.`,
    params: buildColumnIssueParams(context, {
      dataType: context.rawDataType,
      size: effectiveSize,
    }),
  });
}

function validateSizeRules(
  parsed: ParsedDataTypeSpec,
  context: ColumnValidationContext,
  issues: DdlValidationIssue[],
): void {
  if (context.rawSize !== "" && parsed.inlineSize !== "" && context.rawSize !== parsed.inlineSize) {
    appendConflictingSizeDefinitionsIssue(issues, context);
    return;
  }

  const effectiveSize = context.rawSize || parsed.inlineSize;
  if (effectiveSize === "") {
    return;
  }

  if (!NUMERIC_SIZE_PATTERN.test(effectiveSize)) {
    appendInvalidSizeFormatIssue(issues, context, effectiveSize);
    return;
  }

  const sizeRule = SIZE_RULES[parsed.baseType];
  if (sizeRule === "none") {
    if (allowsCompatibilitySizeOne(parsed.baseType, effectiveSize)) {
      return;
    }
    appendTypeMustNotIncludeSizeIssue(issues, context, effectiveSize);
    return;
  }

  if (sizeRule === "integer" && !INTEGER_SIZE_PATTERN.test(effectiveSize)) {
    appendTypeOnlyAcceptsIntegerSizeIssue(issues, context, effectiveSize);
  }
}

function validateColumnDataType(
  table: TableInfo,
  column: TableInfo["columns"][number],
  issues: DdlValidationIssue[],
): void {
  const context = createColumnValidationContext(table, column);
  if (isEmpty(context.rawDataType)) {
    appendMissingDataTypeIssue(issues, context);
    return;
  }

  const parsed = parseDataTypeSpec(context.rawDataType);
  if (!parsed || !SUPPORTED_DATA_TYPES.has(parsed.baseType)) {
    appendUnsupportedDataTypeIssue(issues, context);
    return;
  }

  validateSizeRules(parsed, context, issues);
}

function validateDataType(table: TableInfo, issues: DdlValidationIssue[]): void {
  table.columns.forEach((column) => {
    validateColumnDataType(table, column, issues);
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
