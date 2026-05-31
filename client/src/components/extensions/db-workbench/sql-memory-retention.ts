import { normalizeIdentifier } from "./sql-memory-normalization";
import type {
  SqlMemoryClearOptions,
  SqlMemoryQueryPattern,
  SqlMemoryRetentionSettings,
  SqlWorkbenchMemoryState,
} from "./sql-memory-types";

export const DEFAULT_RETENTION: SqlMemoryRetentionSettings = {
  trackAcceptedSuggestions: true,
  trackQueryPatterns: true,
  captureValueProfiles: true,
};

export function sanitizeRetentionSettings(value: unknown): SqlMemoryRetentionSettings {
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
