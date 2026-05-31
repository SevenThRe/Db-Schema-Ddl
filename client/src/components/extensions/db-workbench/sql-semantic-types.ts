export type SqlSemanticRelationKind = "table" | "view" | "cte" | "subquery";
export type SqlCompletionScope = "general" | "relation" | "column";
export type SqlClauseContext =
  | "general"
  | "select"
  | "from"
  | "join"
  | "on"
  | "where"
  | "having"
  | "group-by"
  | "order-by"
  | "update"
  | "into"
  | "values"
  | "set"
  | "returning";
export type SqlStatementKind =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "unknown";

export interface SqlSemanticRelation {
  schema: string;
  name: string;
  kind: SqlSemanticRelationKind;
  columns: string[];
}

export interface SqlSemanticContext {
  activeSchema: string;
  relations: SqlSemanticRelation[];
}

export interface SqlSemanticBinding {
  alias: string;
  relation: SqlSemanticRelation;
}

export interface SqlClauseSpan {
  clause: SqlClauseContext;
  startOffset: number;
  endOffset: number;
}

export interface SqlSemanticStatement {
  kind: SqlStatementKind;
  clauses: SqlClauseSpan[];
  ctes: SqlSemanticRelation[];
  projectedColumns: string[];
}

export interface SqlMemberAccess {
  alias: string;
  binding: SqlSemanticBinding | null;
}

export interface SqlSemanticAnalysis {
  statement: SqlSemanticStatement;
  statementSql: string;
  statementOffset: number;
  cursorOffsetInStatement: number;
  clause: SqlClauseContext;
  scope: SqlCompletionScope;
  relations: SqlSemanticRelation[];
  bindings: SqlSemanticBinding[];
  allBindings: SqlSemanticBinding[];
  activeBinding: SqlSemanticBinding | null;
  memberAccess: SqlMemberAccess | null;
}

export interface SqlSemanticHoverSymbol {
  kind: "relation" | "column";
  label: string;
  detail: string;
  documentation: string[];
  startOffset: number;
  endOffset: number;
}

export interface SqlSemanticDiagnostic {
  code:
    | "unknown_relation"
    | "duplicate_alias"
    | "unknown_qualifier"
    | "unknown_column"
    | "missing_join_condition"
    | "update_without_where"
    | "delete_without_where";
  severity: "warning" | "error";
  message: string;
  startOffset: number;
  endOffset: number;
}
