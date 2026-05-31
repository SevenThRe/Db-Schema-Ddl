import type { SqlWorkbenchMemoryState } from "./sql-memory";

export type MemoryCategory =
  | "acceptedSuggestions"
  | "queryPatterns"
  | "valueProfiles";

export interface SqlMemoryDialogScope {
  acceptedInScope: SqlWorkbenchMemoryState["acceptedSuggestions"];
  patternsInScope: SqlWorkbenchMemoryState["queryPatterns"];
  valueProfilesInScope: SqlWorkbenchMemoryState["valueProfiles"];
}

export function normalizeMemoryIdentifier(
  value: string | null | undefined,
): string {
  return value?.trim().toLowerCase() ?? "";
}

function patternMatchesSchema(
  schema: string | null,
  pattern: SqlWorkbenchMemoryState["queryPatterns"][number],
): boolean {
  const normalizedSchema = normalizeMemoryIdentifier(schema);
  if (!normalizedSchema) return false;

  return (
    normalizeMemoryIdentifier(pattern.schema) === normalizedSchema ||
    pattern.relationKeys.some((entry) =>
      entry.startsWith(`${normalizedSchema}.`),
    ) ||
    pattern.columnKeys.some((entry) =>
      entry.startsWith(`${normalizedSchema}.`),
    )
  );
}

export function buildSqlMemoryDialogScope(
  memory: SqlWorkbenchMemoryState,
  activeSchema: string | null,
): SqlMemoryDialogScope {
  const normalizedActiveSchema = normalizeMemoryIdentifier(activeSchema);

  return {
    acceptedInScope: memory.acceptedSuggestions.filter(
      (entry) => normalizeMemoryIdentifier(entry.schema) === normalizedActiveSchema,
    ),
    patternsInScope: memory.queryPatterns.filter((entry) =>
      patternMatchesSchema(activeSchema, entry),
    ),
    valueProfilesInScope: memory.valueProfiles.filter(
      (entry) => normalizeMemoryIdentifier(entry.schema) === normalizedActiveSchema,
    ),
  };
}
