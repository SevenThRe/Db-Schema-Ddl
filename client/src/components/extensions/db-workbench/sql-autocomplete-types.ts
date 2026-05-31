import type { DbDriver } from "@shared/schema";
import type {
  SqlMemoryAcceptedSuggestionInput,
  SqlWorkbenchMemoryState,
} from "./sql-memory";

export type SqlCompletionKind =
  | "schema"
  | "table"
  | "view"
  | "column"
  | "keyword"
  | "template"
  | "function"
  | "type";

export type SqlAutocompleteRelationKind = "table" | "view" | "cte" | "subquery";

export interface SqlAutocompleteRelation {
  schema: string;
  name: string;
  kind: SqlAutocompleteRelationKind;
  columns: string[];
}

export interface SqlAutocompleteColumn {
  schema: string;
  relation: string;
  name: string;
}

export interface SqlAutocompleteRoutine {
  schema: string;
  name: string;
  kind: "function" | "procedure";
  signature?: string;
  returnType?: string;
}

export interface SqlAutocompleteJoinEdge {
  sourceSchema: string;
  sourceRelation: string;
  targetSchema: string;
  targetRelation: string;
  sourceColumns: string[];
  targetColumns: string[];
  foreignKeyName: string;
}

export interface SqlAutocompleteContext {
  driver: DbDriver;
  activeSchema: string;
  schemas: string[];
  relations: SqlAutocompleteRelation[];
  columns: SqlAutocompleteColumn[];
  relationLookup: Record<string, SqlAutocompleteRelation>;
  selectedRelation: string | null;
  routines: SqlAutocompleteRoutine[];
  joinEdges: SqlAutocompleteJoinEdge[];
  sqlMemory: SqlWorkbenchMemoryState;
}

export interface SqlAutocompleteAliasHint {
  alias: string;
  table: string;
  schema?: string;
}

export interface SqlCompletionItem {
  label: string;
  insertText: string;
  kind: SqlCompletionKind;
  detail: string;
  sortText: string;
  insertAsSnippet?: boolean;
  schema?: string | null;
  relation?: string | null;
  column?: string | null;
  acceptedSuggestion?: SqlMemoryAcceptedSuggestionInput;
}
