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
