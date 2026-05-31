import {
  nextToken,
  resolveStatementWindow,
  tokenizeSql,
} from "./sql-lexer";
import {
  collectVisibleRelationBindings,
  inferProjectedColumns,
  parseStatementCtes,
  resolveMemberAccess,
} from "./sql-semantic-relation-analysis";
import type {
  SqlClauseContext,
  SqlClauseSpan,
  SqlCompletionScope,
  SqlSemanticAnalysis,
  SqlSemanticContext,
  SqlStatementKind,
} from "./sql-semantic-types";

export function detectStatementKind(mainSql: string): SqlStatementKind {
  const tokens = tokenizeSql(mainSql);
  const first = tokens.find(
    (token) => token.depth === 0 && token.kind === "identifier",
  );
  switch (first?.normalized) {
    case "SELECT":
      return "select";
    case "INSERT":
      return "insert";
    case "UPDATE":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return "unknown";
  }
}

export function buildClauseSpans(
  statementSql: string,
  mainSqlOffset: number,
  kind: SqlStatementKind,
): SqlClauseSpan[] {
  const mainSql = statementSql.slice(mainSqlOffset);
  const tokens = tokenizeSql(mainSql);
  const markers: Array<{ clause: SqlClauseContext; start: number }> = [];

  const pushMarker = (clause: SqlClauseContext, start: number) => {
    const last = markers[markers.length - 1];
    if (last && last.clause === clause && last.start === start) return;
    markers.push({ clause, start });
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.depth !== 0 || token.kind !== "identifier") continue;

    if (token.normalized === "GROUP" && nextToken(tokens, index)?.normalized === "BY") {
      pushMarker("group-by", token.start);
      index += 1;
      continue;
    }

    if (token.normalized === "ORDER" && nextToken(tokens, index)?.normalized === "BY") {
      pushMarker("order-by", token.start);
      index += 1;
      continue;
    }

    switch (token.normalized) {
      case "SELECT":
        if (kind === "select") pushMarker("select", token.start);
        break;
      case "FROM":
        pushMarker("from", token.start);
        break;
      case "JOIN":
        pushMarker("join", token.start);
        break;
      case "ON":
        pushMarker("on", token.start);
        break;
      case "WHERE":
        pushMarker("where", token.start);
        break;
      case "HAVING":
        pushMarker("having", token.start);
        break;
      case "UPDATE":
        if (kind === "update") pushMarker("update", token.start);
        break;
      case "INTO":
        pushMarker("into", token.start);
        break;
      case "VALUES":
        pushMarker("values", token.start);
        break;
      case "SET":
        pushMarker("set", token.start);
        break;
      case "RETURNING":
        pushMarker("returning", token.start);
        break;
      default:
        break;
    }
  }

  if (markers.length === 0) {
    return [
      {
        clause: "general",
        startOffset: mainSqlOffset,
        endOffset: statementSql.length,
      },
    ];
  }

  return markers.map((marker, index) => ({
    clause: marker.clause,
    startOffset: mainSqlOffset + marker.start,
    endOffset:
      mainSqlOffset + (markers[index + 1]?.start ?? mainSql.length),
  }));
}

export function resolveClauseAtCursor(
  spans: SqlClauseSpan[],
  cursorOffsetInStatement: number,
): SqlClauseContext {
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index]!;
    if (cursorOffsetInStatement >= span.startOffset) {
      return span.clause;
    }
  }
  return "general";
}

export function scopeForClause(clause: SqlClauseContext): SqlCompletionScope {
  if (
    clause === "from" ||
    clause === "join" ||
    clause === "update" ||
    clause === "into"
  ) {
    return "relation";
  }

  if (clause === "general" || clause === "values") {
    return "general";
  }

  return "column";
}

export function resolveStatementRanges(
  sqlText: string,
): Array<{ startOffset: number; endOffset: number }> {
  const tokens = tokenizeSql(sqlText);
  if (tokens.length === 0) {
    return sqlText.trim()
      ? [{ startOffset: 0, endOffset: sqlText.length }]
      : [];
  }

  const segments: Array<{ startOffset: number; endOffset: number }> = [];
  let segmentStart = 0;

  for (const token of tokens) {
    if (token.text === ";" && token.depth === 0) {
      const statementSql = sqlText.slice(segmentStart, token.start);
      if (statementSql.trim()) {
        segments.push({ startOffset: segmentStart, endOffset: token.start });
      }
      segmentStart = token.end;
    }
  }

  const tail = sqlText.slice(segmentStart);
  if (tail.trim()) {
    segments.push({ startOffset: segmentStart, endOffset: sqlText.length });
  }

  return segments;
}

export function analyzeSqlContext(
  context: SqlSemanticContext,
  sqlText: string,
  cursorOffset: number,
): SqlSemanticAnalysis {
  const statement = resolveStatementWindow(sqlText, cursorOffset);
  const ctes = parseStatementCtes(
    statement.statementSql,
    context.relations,
    context.activeSchema,
  );
  const relations = [...context.relations, ...ctes.relations];
  const mainSql = statement.statementSql.slice(ctes.mainSqlOffset);
  const kind = detectStatementKind(mainSql);
  const clauses = buildClauseSpans(statement.statementSql, ctes.mainSqlOffset, kind);
  const clause = resolveClauseAtCursor(clauses, statement.cursorOffsetInStatement);
  const bindings = collectVisibleRelationBindings(
    statement.statementSql,
    relations,
    context.activeSchema,
    statement.cursorOffsetInStatement,
  );
  const allBindings = collectVisibleRelationBindings(
    statement.statementSql,
    relations,
    context.activeSchema,
    statement.statementSql.length,
  );
  const memberAccess = resolveMemberAccess(
    statement.statementSql,
    statement.cursorOffsetInStatement,
    allBindings,
  );

  return {
    statement: {
      kind,
      clauses,
      ctes: ctes.relations,
      projectedColumns: inferProjectedColumns(
        statement.statementSql,
        context.relations,
        context.activeSchema,
      ),
    },
    statementSql: statement.statementSql,
    statementOffset: statement.statementOffset,
    cursorOffsetInStatement: statement.cursorOffsetInStatement,
    clause,
    scope: scopeForClause(clause),
    relations,
    bindings,
    allBindings,
    activeBinding: memberAccess?.binding ?? null,
    memberAccess,
  };
}
