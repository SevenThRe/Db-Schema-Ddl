import type {
  DbGridEditSource,
  DbQueryBatchResult,
  QueryExecutionResponse,
} from "@shared/schema";
import type {
  SqlMemoryAcceptedSuggestionInput,
  SqlMemoryQueryPatternInput,
  SqlMemoryStatementKind,
  SqlMemoryValueProfileInput,
} from "./sql-memory-types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?)?$/i;
const JSON_LIKE_PATTERN = /^[\[{][\s\S]*[\]}]$/;

export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

export function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
}

function collapseSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

export function toSqlMemoryRelationKey(schema: string, relation: string): string {
  return `${normalizeIdentifier(schema)}.${normalizeIdentifier(relation)}`;
}

export function toSqlMemoryColumnKey(
  schema: string,
  relation: string,
  column: string,
): string {
  return `${toSqlMemoryRelationKey(schema, relation)}.${normalizeIdentifier(column)}`;
}

export function buildSqlMemorySuggestionKey(
  input: Pick<
    SqlMemoryAcceptedSuggestionInput,
    "label" | "kind" | "schema" | "relation" | "column"
  >,
): string {
  return [
    input.kind.trim().toLowerCase(),
    normalizeIdentifier(input.label),
    normalizeIdentifier(input.schema?.trim() ?? ""),
    normalizeIdentifier(input.relation?.trim() ?? ""),
    normalizeIdentifier(input.column?.trim() ?? ""),
  ].join("::");
}

export function summarizeSqlPattern(sql: string, limit = 88): string {
  const singleLine = collapseSql(sql);
  if (!singleLine) return "(empty SQL)";
  if (singleLine.length <= limit) return singleLine;
  return `${singleLine.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function normalizeSqlPattern(sql: string): string {
  return collapseSql(sql)
    .replace(/'([^']|'')*'/g, "?")
    .replace(/"([^"]|"")*"/g, "?")
    .replace(/`[^`]*`/g, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\btrue\b|\bfalse\b|null\b/gi, "?")
    .trim();
}

export function inferSqlMemoryStatementKind(sql: string): SqlMemoryStatementKind {
  const normalized = sql
    .replace(/^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/g, "")
    .trimStart()
    .toLowerCase();

  if (!normalized) return "unknown";
  if (normalized.startsWith("select ") || normalized.startsWith("with ")) return "select";
  if (normalized.startsWith("insert ")) return "insert";
  if (normalized.startsWith("update ")) return "update";
  if (normalized.startsWith("delete ")) return "delete";
  return "unknown";
}

function classifyObservedValue(value: string | number | boolean | null): {
  kind: string;
  hint: string;
} {
  if (value === null) {
    return { kind: "null", hint: "null" };
  }

  if (typeof value === "boolean") {
    return { kind: "boolean", hint: "boolean" };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { kind: "integer", hint: "integer" };
    }
    return { kind: "number", hint: "number" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: "empty-text", hint: "empty text" };
  }
  if (UUID_PATTERN.test(trimmed)) {
    return { kind: "uuid-like", hint: "uuid-like" };
  }
  if (EMAIL_PATTERN.test(trimmed)) {
    return { kind: "email-like", hint: "email-like" };
  }
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return { kind: "timestamp-like", hint: "timestamp-like" };
  }
  if (JSON_LIKE_PATTERN.test(trimmed)) {
    return { kind: "json-like", hint: "json-like" };
  }
  if (/^-?\d+$/.test(trimmed)) {
    return { kind: "integer-like", hint: "integer-like" };
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return { kind: "number-like", hint: "number-like" };
  }
  if (trimmed.length > 48) {
    return { kind: "long-text", hint: "long text" };
  }
  return { kind: "text", hint: "text" };
}

export function extractSqlMemoryValueProfilesFromBatches(
  batches: DbQueryBatchResult[],
  fallbackSchema: string,
  fallbackRelation?: string | null,
): SqlMemoryValueProfileInput[] {
  const aggregates = new Map<
    string,
    {
      schema: string;
      relation: string;
      column: string;
      sampleCount: number;
      nullCount: number;
      observedKinds: Set<string>;
      exampleHints: Set<string>;
    }
  >();

  for (const batch of batches) {
    if (batch.error) continue;
    const rows = batch.rows.slice(0, 50);
    const batchSchema = batch.schema?.trim() || fallbackSchema;
    const batchRelation = fallbackRelation?.trim() || batch.editSource?.tableName?.trim() || null;

    batch.columns.forEach((column, columnIndex) => {
      const relation = column.sourceTable?.trim() || batchRelation;
      const sourceColumn = column.sourceColumn?.trim() || column.name.trim();
      if (!relation || !sourceColumn) return;

      const schema = column.sourceSchema?.trim() || batchSchema;
      const key = toSqlMemoryColumnKey(schema, relation, sourceColumn);
      const current =
        aggregates.get(key) ??
        {
          schema,
          relation,
          column: sourceColumn,
          sampleCount: 0,
          nullCount: 0,
          observedKinds: new Set<string>(),
          exampleHints: new Set<string>(),
        };

      for (const row of rows) {
        const value = row.values[columnIndex] ?? null;
        current.sampleCount += 1;
        if (value === null) {
          current.nullCount += 1;
        }
        const observed = classifyObservedValue(value);
        current.observedKinds.add(observed.kind);
        current.exampleHints.add(observed.hint);
      }

      if (current.sampleCount > 0) {
        aggregates.set(key, current);
      }
    });
  }

  return Array.from(aggregates.values()).map((entry) => ({
    schema: entry.schema,
    relation: entry.relation,
    column: entry.column,
    sampleCount: entry.sampleCount,
    nullCount: entry.nullCount,
    observedKinds: Array.from(entry.observedKinds).sort((left, right) =>
      left.localeCompare(right),
    ),
    exampleHints: Array.from(entry.exampleHints).sort((left, right) =>
      left.localeCompare(right),
    ),
  }));
}

export function buildQueryMemoryPatternFromResponse(
  sql: string,
  mode: "statement" | "script",
  response: QueryExecutionResponse,
  runtimeSchema: string | undefined,
  source: DbGridEditSource | null,
): SqlMemoryQueryPatternInput {
  const relationKeys = new Set<string>();
  const columnKeys = new Set<string>();
  const fallbackSchema =
    runtimeSchema?.trim() || source?.schema?.trim() || response.batches[0]?.schema?.trim() || "public";
  const fallbackRelation = source?.tableName?.trim() || null;

  if (fallbackRelation) {
    relationKeys.add(toSqlMemoryRelationKey(fallbackSchema, fallbackRelation));
  }

  for (const batch of response.batches) {
    if (batch.error) continue;
    const batchSchema = batch.schema?.trim() || fallbackSchema;
    const batchRelation = batch.editSource?.tableName?.trim() || fallbackRelation;

    if (batchRelation) {
      relationKeys.add(toSqlMemoryRelationKey(batchSchema, batchRelation));
    }

    for (const column of batch.columns) {
      const columnSchema = column.sourceSchema?.trim() || batchSchema;
      const relation = column.sourceTable?.trim() || batchRelation;
      const sourceColumn = column.sourceColumn?.trim() || column.name.trim();
      if (!relation || !sourceColumn) continue;
      relationKeys.add(toSqlMemoryRelationKey(columnSchema, relation));
      columnKeys.add(toSqlMemoryColumnKey(columnSchema, relation, sourceColumn));
    }
  }

  return {
    patternSql: sql,
    summary: summarizeSqlPattern(sql),
    statementKind: mode === "script" ? "script" : inferSqlMemoryStatementKind(sql),
    schema: runtimeSchema ?? source?.schema ?? null,
    relationKeys: Array.from(relationKeys),
    columnKeys: Array.from(columnKeys),
  };
}
