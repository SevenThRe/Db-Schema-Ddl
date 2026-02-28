export const PHYSICAL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const CAMEL_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/g;
const NON_ALNUM_UNDERSCORE_PATTERN = /[^A-Za-z0-9_]+/g;
const MULTIPLE_UNDERSCORE_PATTERN = /_+/g;
const EDGE_UNDERSCORE_PATTERN = /^_+|_+$/g;

const DEFAULT_TABLE_FALLBACK = "unnamed_table";
const DEFAULT_COLUMN_FALLBACK_PREFIX = "column_";
const DEFAULT_RESERVED_PREFIX = "n_";

const RESERVED_WORDS = new Set(
  [
    "add",
    "all",
    "alter",
    "and",
    "as",
    "asc",
    "between",
    "by",
    "case",
    "check",
    "column",
    "constraint",
    "create",
    "database",
    "default",
    "delete",
    "desc",
    "distinct",
    "drop",
    "else",
    "exists",
    "foreign",
    "from",
    "group",
    "having",
    "in",
    "index",
    "insert",
    "into",
    "is",
    "join",
    "key",
    "like",
    "limit",
    "not",
    "null",
    "on",
    "or",
    "order",
    "primary",
    "references",
    "select",
    "set",
    "table",
    "then",
    "to",
    "union",
    "unique",
    "update",
    "user",
    "using",
    "values",
    "view",
    "when",
    "where",
  ],
);

export type NameFixConflictStrategy = "suffix_increment" | "hash_suffix" | "abort";
export type ReservedWordStrategy = "prefix" | "abort";
export type LengthOverflowStrategy = "truncate_hash" | "abort";

export interface PhysicalNameColumn {
  logicalName?: string;
  physicalName?: string;
  [key: string]: unknown;
}

export interface PhysicalNameTable<TColumn extends PhysicalNameColumn = PhysicalNameColumn> {
  logicalTableName: string;
  physicalTableName: string;
  columns: TColumn[];
  [key: string]: unknown;
}

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

export type NameFixConflictType =
  | "table_duplicate"
  | "column_duplicate"
  | "reserved_word"
  | "length_overflow"
  | "invalid_name";

export interface NameFixConflict {
  type: NameFixConflictType;
  blocking: boolean;
  tableIndex: number;
  columnIndex?: number;
  target: "table" | "column";
  currentName: string;
  attemptedName: string;
  reason: string;
}

export interface NameFixDecisionTrace {
  target: "table" | "column";
  tableIndex: number;
  columnIndex?: number;
  before: string;
  normalized: string;
  after: string;
  reasons: string[];
}

export interface NameFixPlanOptions {
  conflictStrategy?: NameFixConflictStrategy;
  reservedWordStrategy?: ReservedWordStrategy;
  lengthOverflowStrategy?: LengthOverflowStrategy;
  maxIdentifierLength?: number;
  reservedPrefix?: string;
}

export interface NameFixPlanResult<TTable extends PhysicalNameTable = PhysicalNameTable> {
  fixedTables: TTable[];
  tableNamesChanged: number;
  columnNamesChanged: number;
  conflicts: NameFixConflict[];
  blockingConflicts: NameFixConflict[];
  decisionTrace: NameFixDecisionTrace[];
}

function normalizeIdentifierLength(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 64;
  }
  const normalized = Math.floor(Number(value));
  if (normalized < 8) {
    return 8;
  }
  if (normalized > 255) {
    return 255;
  }
  return normalized;
}

function shortHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

function clampWithSuffix(base: string, suffix: string, maxLength: number): string {
  if (base.length + suffix.length <= maxLength) {
    return `${base}${suffix}`;
  }
  const trimmedBase = base.slice(0, Math.max(1, maxLength - suffix.length));
  return `${trimmedBase}${suffix}`;
}

function resolveLengthOverflow(
  value: string,
  maxLength: number,
  lengthOverflowStrategy: LengthOverflowStrategy,
): { value: string; changed: boolean; blocking: boolean } {
  if (value.length <= maxLength) {
    return { value, changed: false, blocking: false };
  }

  if (lengthOverflowStrategy === "abort") {
    return { value, changed: false, blocking: true };
  }

  const suffix = `_${shortHash(value)}`;
  const trimmed = clampWithSuffix(value, suffix, maxLength);
  return { value: trimmed, changed: true, blocking: false };
}

function resolveReservedWord(
  value: string,
  reservedWordStrategy: ReservedWordStrategy,
  reservedPrefix: string,
): { value: string; changed: boolean; blocking: boolean } {
  if (!RESERVED_WORDS.has(value.toLowerCase())) {
    return { value, changed: false, blocking: false };
  }

  if (reservedWordStrategy === "abort") {
    return { value, changed: false, blocking: true };
  }

  const prefix = reservedPrefix.trim() || DEFAULT_RESERVED_PREFIX;
  return {
    value: `${prefix}${value}`,
    changed: true,
    blocking: false,
  };
}

function resolveDuplicate(
  value: string,
  keyPrefix: string,
  usedNames: Set<string>,
  maxLength: number,
  conflictStrategy: NameFixConflictStrategy,
): { value: string; changed: boolean; blocking: boolean } {
  const lowerValue = value.toLowerCase();
  if (!usedNames.has(lowerValue)) {
    return { value, changed: false, blocking: false };
  }

  if (conflictStrategy === "abort") {
    return { value, changed: false, blocking: true };
  }

  if (conflictStrategy === "hash_suffix") {
    const candidate = clampWithSuffix(value, `_${shortHash(`${keyPrefix}:${value}`)}`, maxLength);
    if (!usedNames.has(candidate.toLowerCase())) {
      return { value: candidate, changed: true, blocking: false };
    }
  }

  for (let i = 2; i < 10_000; i++) {
    const suffix = `_${i}`;
    const candidate = clampWithSuffix(value, suffix, maxLength);
    if (!usedNames.has(candidate.toLowerCase())) {
      return { value: candidate, changed: true, blocking: false };
    }
  }

  return { value, changed: false, blocking: true };
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

export function validateTablePhysicalNames<TTable extends PhysicalNameTable>(table: TTable): TableNameValidation {
  const tableNameCurrent = table.physicalTableName ?? "";
  const tableNameSuggested = normalizePhysicalName(
    tableNameCurrent || table.logicalTableName,
    DEFAULT_TABLE_FALLBACK,
  );
  const hasInvalidTableName = !isValidPhysicalName(tableNameCurrent);

  const invalidColumns: ColumnNameIssue[] = table.columns
    .map((column, columnIndex) => {
      const currentName = (column.physicalName ?? "").trim();
      const suggestedName = normalizePhysicalName(
        currentName || column.logicalName || `${DEFAULT_COLUMN_FALLBACK_PREFIX}${columnIndex + 1}`,
        `${DEFAULT_COLUMN_FALLBACK_PREFIX}${columnIndex + 1}`,
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

function resolveCandidate(
  originalValue: string,
  fallbackName: string,
  keyPrefix: string,
  usedNames: Set<string>,
  options: Required<NameFixPlanOptions>,
): {
  resolved: string;
  conflicts: NameFixConflict[];
  reasons: string[];
  normalized: string;
} {
  const conflicts: NameFixConflict[] = [];
  const reasons: string[] = [];
  const normalized = normalizePhysicalName(originalValue || fallbackName, fallbackName);
  let candidate = normalized;

  if (!isValidPhysicalName(candidate)) {
    conflicts.push({
      type: "invalid_name",
      blocking: true,
      tableIndex: -1,
      target: keyPrefix.startsWith("table:") ? "table" : "column",
      currentName: originalValue,
      attemptedName: candidate,
      reason: "Normalized name still violates identifier pattern.",
    });
  }

  const reservedResult = resolveReservedWord(
    candidate,
    options.reservedWordStrategy,
    options.reservedPrefix,
  );
  if (reservedResult.changed) {
    reasons.push("reserved_word_prefixed");
    candidate = reservedResult.value;
  }
  if (reservedResult.blocking) {
    conflicts.push({
      type: "reserved_word",
      blocking: true,
      tableIndex: -1,
      target: keyPrefix.startsWith("table:") ? "table" : "column",
      currentName: originalValue,
      attemptedName: candidate,
      reason: "Identifier is a reserved word and strategy is abort.",
    });
  }

  const overflowResult = resolveLengthOverflow(
    candidate,
    options.maxIdentifierLength,
    options.lengthOverflowStrategy,
  );
  if (overflowResult.changed) {
    reasons.push("length_overflow_truncated");
    candidate = overflowResult.value;
  }
  if (overflowResult.blocking) {
    conflicts.push({
      type: "length_overflow",
      blocking: true,
      tableIndex: -1,
      target: keyPrefix.startsWith("table:") ? "table" : "column",
      currentName: originalValue,
      attemptedName: candidate,
      reason: `Identifier length exceeds max ${options.maxIdentifierLength}.`,
    });
  }

  const duplicateResult = resolveDuplicate(
    candidate,
    keyPrefix,
    usedNames,
    options.maxIdentifierLength,
    options.conflictStrategy,
  );
  if (duplicateResult.changed) {
    reasons.push("duplicate_resolved");
    candidate = duplicateResult.value;
  }
  if (duplicateResult.blocking) {
    conflicts.push({
      type: keyPrefix.startsWith("table:") ? "table_duplicate" : "column_duplicate",
      blocking: true,
      tableIndex: -1,
      target: keyPrefix.startsWith("table:") ? "table" : "column",
      currentName: originalValue,
      attemptedName: candidate,
      reason: "Identifier duplicate cannot be resolved with current conflict strategy.",
    });
  }

  return {
    resolved: candidate,
    conflicts,
    reasons,
    normalized,
  };
}

export function applyNameFixPlan<TTable extends PhysicalNameTable>(
  tables: TTable[],
  options: NameFixPlanOptions = {},
): NameFixPlanResult<TTable> {
  const normalizedOptions: Required<NameFixPlanOptions> = {
    conflictStrategy: options.conflictStrategy ?? "suffix_increment",
    reservedWordStrategy: options.reservedWordStrategy ?? "prefix",
    lengthOverflowStrategy: options.lengthOverflowStrategy ?? "truncate_hash",
    maxIdentifierLength: normalizeIdentifierLength(options.maxIdentifierLength),
    reservedPrefix: options.reservedPrefix ?? DEFAULT_RESERVED_PREFIX,
  };

  const globalTableNames = new Set<string>();
  const conflicts: NameFixConflict[] = [];
  const decisionTrace: NameFixDecisionTrace[] = [];
  let tableNamesChanged = 0;
  let columnNamesChanged = 0;

  const fixedTables = tables.map((table, tableIndex) => {
    const tableInput = table.physicalTableName || table.logicalTableName || DEFAULT_TABLE_FALLBACK;
    const tableResult = resolveCandidate(
      tableInput,
      DEFAULT_TABLE_FALLBACK,
      `table:${tableIndex}`,
      globalTableNames,
      normalizedOptions,
    );
    const resolvedTableName = tableResult.resolved;
    const tableChanged = resolvedTableName !== (table.physicalTableName ?? "");
    if (tableChanged) {
      tableNamesChanged += 1;
    }
    globalTableNames.add(resolvedTableName.toLowerCase());

    tableResult.conflicts.forEach((conflict) => {
      conflicts.push({
        ...conflict,
        tableIndex,
      });
    });
    decisionTrace.push({
      target: "table",
      tableIndex,
      before: table.physicalTableName ?? "",
      normalized: tableResult.normalized,
      after: resolvedTableName,
      reasons: tableResult.reasons,
    });

    const perTableColumnNames = new Set<string>();
    const fixedColumns = table.columns.map((column, columnIndex) => {
      const columnInput =
        (column.physicalName ?? "").trim() ||
        (column.logicalName ?? "").trim() ||
        `${DEFAULT_COLUMN_FALLBACK_PREFIX}${columnIndex + 1}`;

      const columnResult = resolveCandidate(
        columnInput,
        `${DEFAULT_COLUMN_FALLBACK_PREFIX}${columnIndex + 1}`,
        `table:${tableIndex}:column:${columnIndex}`,
        perTableColumnNames,
        normalizedOptions,
      );
      const resolvedColumnName = columnResult.resolved;
      const columnChanged = resolvedColumnName !== (column.physicalName ?? "");
      if (columnChanged) {
        columnNamesChanged += 1;
      }
      perTableColumnNames.add(resolvedColumnName.toLowerCase());

      columnResult.conflicts.forEach((conflict) => {
        conflicts.push({
          ...conflict,
          tableIndex,
          columnIndex,
        });
      });
      decisionTrace.push({
        target: "column",
        tableIndex,
        columnIndex,
        before: column.physicalName ?? "",
        normalized: columnResult.normalized,
        after: resolvedColumnName,
        reasons: columnResult.reasons,
      });

      return {
        ...column,
        physicalName: resolvedColumnName,
      };
    });

    return {
      ...table,
      physicalTableName: resolvedTableName,
      columns: fixedColumns,
    };
  }) as TTable[];

  const blockingConflicts = conflicts.filter((conflict) => conflict.blocking);
  return {
    fixedTables,
    tableNamesChanged,
    columnNamesChanged,
    conflicts,
    blockingConflicts,
    decisionTrace,
  };
}

export function autoFixTablePhysicalNames<TTable extends PhysicalNameTable>(table: TTable): TTable {
  const result = applyNameFixPlan([table]);
  return result.fixedTables[0] as TTable;
}

