import type {
  DbGridEditSource,
  DbQueryBatchResult,
  QueryExecutionResponse,
} from "@shared/schema";

export type SqlMemorySuggestionKind =
  | "schema"
  | "table"
  | "view"
  | "column"
  | "keyword"
  | "template"
  | "function"
  | "type";

export type SqlMemoryStatementKind =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "script"
  | "unknown";

export interface SqlMemoryRetentionSettings {
  trackAcceptedSuggestions: boolean;
  trackQueryPatterns: boolean;
  captureValueProfiles: boolean;
}

export interface SqlMemoryAcceptedSuggestion {
  key: string;
  label: string;
  kind: SqlMemorySuggestionKind;
  schema: string | null;
  relation: string | null;
  column: string | null;
  count: number;
  lastAcceptedAt: string;
}

export interface SqlMemoryQueryPattern {
  key: string;
  summary: string;
  patternSql: string;
  statementKind: SqlMemoryStatementKind;
  schema: string | null;
  relationKeys: string[];
  columnKeys: string[];
  count: number;
  lastExecutedAt: string;
}

export interface SqlMemoryValueProfile {
  key: string;
  schema: string;
  relation: string;
  column: string;
  sampleCount: number;
  nullCount: number;
  observedKinds: string[];
  exampleHints: string[];
  lastObservedAt: string;
}

export interface SqlWorkbenchMemoryState {
  retention: SqlMemoryRetentionSettings;
  acceptedSuggestions: SqlMemoryAcceptedSuggestion[];
  queryPatterns: SqlMemoryQueryPattern[];
  valueProfiles: SqlMemoryValueProfile[];
}

export interface SqlMemoryAcceptedSuggestionInput {
  label: string;
  kind: SqlMemorySuggestionKind;
  schema?: string | null;
  relation?: string | null;
  column?: string | null;
  acceptedAt?: string;
}

export interface SqlMemoryQueryPatternInput {
  patternSql: string;
  summary?: string;
  statementKind: SqlMemoryStatementKind;
  schema?: string | null;
  relationKeys?: string[];
  columnKeys?: string[];
  executedAt?: string;
}

export interface SqlMemoryValueProfileInput {
  schema: string;
  relation: string;
  column: string;
  sampleCount: number;
  nullCount?: number;
  observedKinds: string[];
  exampleHints?: string[];
  observedAt?: string;
}

export interface SqlMemoryClearOptions {
  schema?: string | null;
  categories?: Array<"acceptedSuggestions" | "queryPatterns" | "valueProfiles">;
}

const MAX_ACCEPTED_SUGGESTIONS = 120;
const MAX_QUERY_PATTERNS = 80;
const MAX_VALUE_PROFILES = 96;

const DEFAULT_RETENTION: SqlMemoryRetentionSettings = {
  trackAcceptedSuggestions: true,
  trackQueryPatterns: true,
  captureValueProfiles: true,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?)?$/i;
const JSON_LIKE_PATTERN = /^[\[{][\s\S]*[\]}]$/;

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
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

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
}

function collapseSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function sortAcceptedSuggestions(
  values: SqlMemoryAcceptedSuggestion[],
): SqlMemoryAcceptedSuggestion[] {
  return [...values]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.lastAcceptedAt.localeCompare(left.lastAcceptedAt);
    })
    .slice(0, MAX_ACCEPTED_SUGGESTIONS);
}

function sortQueryPatterns(values: SqlMemoryQueryPattern[]): SqlMemoryQueryPattern[] {
  return [...values]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.lastExecutedAt.localeCompare(left.lastExecutedAt);
    })
    .slice(0, MAX_QUERY_PATTERNS);
}

function sortValueProfiles(values: SqlMemoryValueProfile[]): SqlMemoryValueProfile[] {
  return [...values]
    .sort((left, right) => {
      if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount;
      return right.lastObservedAt.localeCompare(left.lastObservedAt);
    })
    .slice(0, MAX_VALUE_PROFILES);
}

function sanitizeRetentionSettings(value: unknown): SqlMemoryRetentionSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_RETENTION };
  }

  const next = value as Partial<SqlMemoryRetentionSettings>;
  return {
    trackAcceptedSuggestions:
      typeof next.trackAcceptedSuggestions === "boolean"
        ? next.trackAcceptedSuggestions
        : DEFAULT_RETENTION.trackAcceptedSuggestions,
    trackQueryPatterns:
      typeof next.trackQueryPatterns === "boolean"
        ? next.trackQueryPatterns
        : DEFAULT_RETENTION.trackQueryPatterns,
    captureValueProfiles:
      typeof next.captureValueProfiles === "boolean"
        ? next.captureValueProfiles
        : DEFAULT_RETENTION.captureValueProfiles,
  };
}

export function createEmptySqlWorkbenchMemory(): SqlWorkbenchMemoryState {
  return {
    retention: { ...DEFAULT_RETENTION },
    acceptedSuggestions: [],
    queryPatterns: [],
    valueProfiles: [],
  };
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

function normalizeSqlPattern(sql: string): string {
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

export function sanitizeSqlWorkbenchMemory(value: unknown): SqlWorkbenchMemoryState {
  if (typeof value !== "object" || value === null) {
    return createEmptySqlWorkbenchMemory();
  }

  const candidate = value as Partial<SqlWorkbenchMemoryState>;
  const acceptedSuggestions = Array.isArray(candidate.acceptedSuggestions)
    ? candidate.acceptedSuggestions
        .flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const suggestion = entry as Partial<SqlMemoryAcceptedSuggestion>;
          const label = toNonEmptyString(suggestion.label);
          const kind = toNonEmptyString(suggestion.kind);
          if (!label || !kind) return [];

          return [
            {
              key:
                toNonEmptyString(suggestion.key) ??
                buildSqlMemorySuggestionKey({
                  label,
                  kind: kind as SqlMemorySuggestionKind,
                  schema: toNonEmptyString(suggestion.schema),
                  relation: toNonEmptyString(suggestion.relation),
                  column: toNonEmptyString(suggestion.column),
                }),
              label,
              kind: kind as SqlMemorySuggestionKind,
              schema: toNonEmptyString(suggestion.schema),
              relation: toNonEmptyString(suggestion.relation),
              column: toNonEmptyString(suggestion.column),
              count:
                typeof suggestion.count === "number" && Number.isFinite(suggestion.count)
                  ? Math.max(1, Math.trunc(suggestion.count))
                  : 1,
              lastAcceptedAt:
                toNonEmptyString(suggestion.lastAcceptedAt) ?? new Date().toISOString(),
            },
          ];
        })
    : [];

  const queryPatterns = Array.isArray(candidate.queryPatterns)
    ? candidate.queryPatterns.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const pattern = entry as Partial<SqlMemoryQueryPattern>;
        const patternSql = toNonEmptyString(pattern.patternSql);
        if (!patternSql) return [];

        return [
          {
            key:
              toNonEmptyString(pattern.key) ??
              [
                normalizeIdentifier(toNonEmptyString(pattern.schema) ?? ""),
                toNonEmptyString(pattern.statementKind) ?? "unknown",
                normalizeSqlPattern(patternSql),
              ].join("::"),
            summary: toNonEmptyString(pattern.summary) ?? summarizeSqlPattern(patternSql),
            patternSql,
            statementKind:
              (toNonEmptyString(pattern.statementKind) as SqlMemoryStatementKind | null) ??
              "unknown",
            schema: toNonEmptyString(pattern.schema),
            relationKeys: sanitizeStringArray(pattern.relationKeys),
            columnKeys: sanitizeStringArray(pattern.columnKeys),
            count:
              typeof pattern.count === "number" && Number.isFinite(pattern.count)
                ? Math.max(1, Math.trunc(pattern.count))
                : 1,
            lastExecutedAt:
              toNonEmptyString(pattern.lastExecutedAt) ?? new Date().toISOString(),
          },
        ];
      })
    : [];

  const valueProfiles = Array.isArray(candidate.valueProfiles)
    ? candidate.valueProfiles.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const profile = entry as Partial<SqlMemoryValueProfile>;
        const schema = toNonEmptyString(profile.schema);
        const relation = toNonEmptyString(profile.relation);
        const column = toNonEmptyString(profile.column);
        if (!schema || !relation || !column) return [];

        return [
          {
            key:
              toNonEmptyString(profile.key) ?? toSqlMemoryColumnKey(schema, relation, column),
            schema,
            relation,
            column,
            sampleCount:
              typeof profile.sampleCount === "number" && Number.isFinite(profile.sampleCount)
                ? Math.max(1, Math.trunc(profile.sampleCount))
                : 1,
            nullCount:
              typeof profile.nullCount === "number" && Number.isFinite(profile.nullCount)
                ? Math.max(0, Math.trunc(profile.nullCount))
                : 0,
            observedKinds: sanitizeStringArray(profile.observedKinds),
            exampleHints: sanitizeStringArray(profile.exampleHints),
            lastObservedAt:
              toNonEmptyString(profile.lastObservedAt) ?? new Date().toISOString(),
          },
        ];
      })
    : [];

  return {
    retention: sanitizeRetentionSettings(candidate.retention),
    acceptedSuggestions: sortAcceptedSuggestions(acceptedSuggestions),
    queryPatterns: sortQueryPatterns(queryPatterns),
    valueProfiles: sortValueProfiles(valueProfiles),
  };
}

export function recordAcceptedSuggestion(
  memory: SqlWorkbenchMemoryState,
  input: SqlMemoryAcceptedSuggestionInput,
): SqlWorkbenchMemoryState {
  if (!memory.retention.trackAcceptedSuggestions) {
    return memory;
  }

  const label = input.label.trim();
  if (!label) return memory;

  const key = buildSqlMemorySuggestionKey(input);
  const acceptedAt = input.acceptedAt?.trim() ? input.acceptedAt : new Date().toISOString();
  const existing = memory.acceptedSuggestions.find((entry) => entry.key === key);
  const nextEntry: SqlMemoryAcceptedSuggestion = {
    key,
    label,
    kind: input.kind,
    schema: toNonEmptyString(input.schema),
    relation: toNonEmptyString(input.relation),
    column: toNonEmptyString(input.column),
    count: (existing?.count ?? 0) + 1,
    lastAcceptedAt: acceptedAt,
  };

  return {
    ...memory,
    acceptedSuggestions: sortAcceptedSuggestions([
      nextEntry,
      ...memory.acceptedSuggestions.filter((entry) => entry.key !== key),
    ]),
  };
}

export function recordQueryPattern(
  memory: SqlWorkbenchMemoryState,
  input: SqlMemoryQueryPatternInput,
): SqlWorkbenchMemoryState {
  if (!memory.retention.trackQueryPatterns) {
    return memory;
  }

  const patternSql = input.patternSql.trim();
  if (!patternSql) return memory;

  const normalizedPattern = normalizeSqlPattern(patternSql);
  if (!normalizedPattern) return memory;

  const schema = toNonEmptyString(input.schema);
  const key = [
    normalizeIdentifier(schema ?? ""),
    input.statementKind,
    normalizedPattern,
  ].join("::");
  const executedAt = input.executedAt?.trim() ? input.executedAt : new Date().toISOString();
  const existing = memory.queryPatterns.find((entry) => entry.key === key);
  const nextEntry: SqlMemoryQueryPattern = {
    key,
    summary: input.summary?.trim() ? input.summary.trim() : summarizeSqlPattern(patternSql),
    patternSql,
    statementKind: input.statementKind,
    schema,
    relationKeys: uniqueStrings([
      ...(existing?.relationKeys ?? []),
      ...(input.relationKeys ?? []),
    ]),
    columnKeys: uniqueStrings([
      ...(existing?.columnKeys ?? []),
      ...(input.columnKeys ?? []),
    ]),
    count: (existing?.count ?? 0) + 1,
    lastExecutedAt: executedAt,
  };

  return {
    ...memory,
    queryPatterns: sortQueryPatterns([
      nextEntry,
      ...memory.queryPatterns.filter((entry) => entry.key !== key),
    ]),
  };
}

export function recordValueProfiles(
  memory: SqlWorkbenchMemoryState,
  inputs: SqlMemoryValueProfileInput[],
): SqlWorkbenchMemoryState {
  if (!memory.retention.captureValueProfiles || inputs.length === 0) {
    return memory;
  }

  const map = new Map(memory.valueProfiles.map((entry) => [entry.key, entry]));

  for (const input of inputs) {
    const schema = input.schema.trim();
    const relation = input.relation.trim();
    const column = input.column.trim();
    if (!schema || !relation || !column) continue;

    const key = toSqlMemoryColumnKey(schema, relation, column);
    const existing = map.get(key);
    map.set(key, {
      key,
      schema,
      relation,
      column,
      sampleCount: (existing?.sampleCount ?? 0) + Math.max(1, Math.trunc(input.sampleCount)),
      nullCount: (existing?.nullCount ?? 0) + Math.max(0, Math.trunc(input.nullCount ?? 0)),
      observedKinds: uniqueStrings([
        ...(existing?.observedKinds ?? []),
        ...input.observedKinds,
      ]),
      exampleHints: uniqueStrings([
        ...(existing?.exampleHints ?? []),
        ...(input.exampleHints ?? []),
      ]),
      lastObservedAt:
        input.observedAt?.trim() || existing?.lastObservedAt || new Date().toISOString(),
    });
  }

  return {
    ...memory,
    valueProfiles: sortValueProfiles(Array.from(map.values())),
  };
}

export function updateSqlWorkbenchMemoryRetention(
  memory: SqlWorkbenchMemoryState,
  patch: Partial<SqlMemoryRetentionSettings>,
): SqlWorkbenchMemoryState {
  return {
    ...memory,
    retention: {
      ...memory.retention,
      ...patch,
    },
  };
}

function patternMatchesSchema(pattern: SqlMemoryQueryPattern, schema: string): boolean {
  return (
    normalizeIdentifier(pattern.schema ?? "") === schema ||
    pattern.relationKeys.some((entry) => entry.startsWith(`${schema}.`)) ||
    pattern.columnKeys.some((entry) => entry.startsWith(`${schema}.`))
  );
}

export function clearSqlWorkbenchMemory(
  memory: SqlWorkbenchMemoryState,
  options: SqlMemoryClearOptions = {},
): SqlWorkbenchMemoryState {
  const categories = new Set(
    options.categories ?? ["acceptedSuggestions", "queryPatterns", "valueProfiles"],
  );
  const normalizedSchema = normalizeIdentifier(options.schema?.trim() ?? "");
  const hasSchemaScope = normalizedSchema.length > 0;

  return {
    ...memory,
    acceptedSuggestions: categories.has("acceptedSuggestions")
      ? hasSchemaScope
        ? memory.acceptedSuggestions.filter(
            (entry) => normalizeIdentifier(entry.schema ?? "") !== normalizedSchema,
          )
        : []
      : memory.acceptedSuggestions,
    queryPatterns: categories.has("queryPatterns")
      ? hasSchemaScope
        ? memory.queryPatterns.filter((entry) => !patternMatchesSchema(entry, normalizedSchema))
        : []
      : memory.queryPatterns,
    valueProfiles: categories.has("valueProfiles")
      ? hasSchemaScope
        ? memory.valueProfiles.filter(
            (entry) => normalizeIdentifier(entry.schema) !== normalizedSchema,
          )
        : []
      : memory.valueProfiles,
  };
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
