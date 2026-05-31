import {
  sortAcceptedSuggestions,
  sortQueryPatterns,
  sortValueProfiles,
} from "./sql-memory-codec";
import {
  buildSqlMemorySuggestionKey,
  normalizeIdentifier,
  normalizeSqlPattern,
  summarizeSqlPattern,
  toNonEmptyString,
  toSqlMemoryColumnKey,
  uniqueStrings,
} from "./sql-memory-normalization";
import type {
  SqlMemoryAcceptedSuggestion,
  SqlMemoryAcceptedSuggestionInput,
  SqlMemoryQueryPattern,
  SqlMemoryQueryPatternInput,
  SqlMemoryValueProfileInput,
  SqlWorkbenchMemoryState,
} from "./sql-memory-types";

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
