import {
  buildSqlMemorySuggestionKey,
  normalizeIdentifier,
  normalizeSqlPattern,
  sanitizeStringArray,
  summarizeSqlPattern,
  toNonEmptyString,
  toSqlMemoryColumnKey,
} from "./sql-memory-normalization";
import { DEFAULT_RETENTION, sanitizeRetentionSettings } from "./sql-memory-retention";
import type {
  SqlMemoryAcceptedSuggestion,
  SqlMemoryQueryPattern,
  SqlMemoryStatementKind,
  SqlMemorySuggestionKind,
  SqlMemoryValueProfile,
  SqlWorkbenchMemoryState,
} from "./sql-memory-types";

const MAX_ACCEPTED_SUGGESTIONS = 120;
const MAX_QUERY_PATTERNS = 80;
const MAX_VALUE_PROFILES = 96;

export function sortAcceptedSuggestions(
  values: SqlMemoryAcceptedSuggestion[],
): SqlMemoryAcceptedSuggestion[] {
  return [...values]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.lastAcceptedAt.localeCompare(left.lastAcceptedAt);
    })
    .slice(0, MAX_ACCEPTED_SUGGESTIONS);
}

export function sortQueryPatterns(values: SqlMemoryQueryPattern[]): SqlMemoryQueryPattern[] {
  return [...values]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.lastExecutedAt.localeCompare(left.lastExecutedAt);
    })
    .slice(0, MAX_QUERY_PATTERNS);
}

export function sortValueProfiles(values: SqlMemoryValueProfile[]): SqlMemoryValueProfile[] {
  return [...values]
    .sort((left, right) => {
      if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount;
      return right.lastObservedAt.localeCompare(left.lastObservedAt);
    })
    .slice(0, MAX_VALUE_PROFILES);
}

export function createEmptySqlWorkbenchMemory(): SqlWorkbenchMemoryState {
  return {
    retention: { ...DEFAULT_RETENTION },
    acceptedSuggestions: [],
    queryPatterns: [],
    valueProfiles: [],
  };
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
