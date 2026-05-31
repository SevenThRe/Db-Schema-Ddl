import {
  findMatchingParen,
  nextToken,
  normalizeIdentifier,
  previousToken,
  resolveStatementWindow,
  stripIdentifierQuotes,
  tokenizeSql,
  type SqlToken,
} from "./sql-lexer";
import {
  collectVisibleRelationBindings,
  consumeRelationReference,
  inferProjectedColumns,
  parseStatementCtes,
  readAliasToken,
  resolveMemberAccess,
  resolveRelation,
} from "./sql-semantic-relation-analysis";
import type {
  SqlClauseContext,
  SqlClauseSpan,
  SqlCompletionScope,
  SqlSemanticAnalysis,
  SqlSemanticBinding,
  SqlSemanticContext,
  SqlSemanticDiagnostic,
  SqlSemanticHoverSymbol,
  SqlSemanticRelation,
  SqlStatementKind,
} from "./sql-semantic-types";

export type {
  SqlClauseContext,
  SqlClauseSpan,
  SqlCompletionScope,
  SqlMemberAccess,
  SqlSemanticAnalysis,
  SqlSemanticBinding,
  SqlSemanticContext,
  SqlSemanticDiagnostic,
  SqlSemanticHoverSymbol,
  SqlSemanticRelation,
  SqlSemanticRelationKind,
  SqlSemanticStatement,
  SqlStatementKind,
} from "./sql-semantic-types";

function detectStatementKind(mainSql: string): SqlStatementKind {
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

function buildClauseSpans(
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

function resolveClauseAtCursor(
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

function scopeForClause(clause: SqlClauseContext): SqlCompletionScope {
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

function findTokenIndexAtOffset(tokens: SqlToken[], offset: number): number {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (offset >= token.start && offset <= token.end) return index;
    if (offset < token.start) return Math.max(0, index - 1);
  }
  return tokens.length - 1;
}

function describeRelation(
  relation: SqlSemanticRelation,
  alias?: string,
): SqlSemanticHoverSymbol {
  const previewColumns = relation.columns.slice(0, 6);
  const hiddenColumnCount = Math.max(0, relation.columns.length - previewColumns.length);

  return {
    kind: "relation",
    label: alias ? `${alias} -> ${relation.name}` : relation.name,
    detail: `${relation.kind} (${relation.schema})`,
    documentation: [
      alias ? `Alias: ${alias}` : `Relation: ${relation.schema}.${relation.name}`,
      previewColumns.length > 0
        ? `Columns: ${previewColumns.join(", ")}${hiddenColumnCount > 0 ? ` +${hiddenColumnCount} more` : ""}`
        : "Columns: unknown",
    ],
    startOffset: 0,
    endOffset: 0,
  };
}

function resolveStatementRanges(
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

function makeDiagnostic(
  diagnostic: Omit<SqlSemanticDiagnostic, "startOffset" | "endOffset">,
  statementOffset: number,
  startOffset: number,
  endOffset: number,
): SqlSemanticDiagnostic {
  return {
    ...diagnostic,
    startOffset: statementOffset + startOffset,
    endOffset: statementOffset + endOffset,
  };
}

function isClauseBoundaryToken(token: SqlToken | undefined): boolean {
  if (!token || token.depth !== 0 || token.kind !== "identifier") return false;
  return [
    "JOIN",
    "WHERE",
    "GROUP",
    "ORDER",
    "HAVING",
    "RETURNING",
    "LIMIT",
    "OFFSET",
    "SET",
    "VALUES",
    "UNION",
    "EXCEPT",
    "INTERSECT",
  ].includes(token.normalized);
}

function collectStatementDiagnostics(
  context: SqlSemanticContext,
  analysis: SqlSemanticAnalysis,
): SqlSemanticDiagnostic[] {
  const diagnostics: SqlSemanticDiagnostic[] = [];
  const seen = new Set<string>();
  const tokens = tokenizeSql(analysis.statementSql);

  const pushDiagnostic = (diagnostic: SqlSemanticDiagnostic) => {
    const key = [
      diagnostic.code,
      diagnostic.startOffset,
      diagnostic.endOffset,
      diagnostic.message,
    ].join("::");
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
  };

  const aliasSeen = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.depth !== 0 || token.kind !== "identifier") continue;

    if (
      token.normalized === "FROM" ||
      token.normalized === "JOIN" ||
      token.normalized === "UPDATE" ||
      token.normalized === "INTO"
    ) {
      let cursor = index + 1;
      while (
        tokens[cursor]?.normalized === "LATERAL" ||
        tokens[cursor]?.normalized === "ONLY"
      ) {
        cursor += 1;
      }

      const startToken = tokens[cursor];
      if (!startToken) continue;

      if (startToken.text === "(") {
        const closeIndex = findMatchingParen(tokens, cursor);
        if (closeIndex < 0) continue;
        const aliasToken = readAliasToken(tokens, closeIndex + 1);
        if (aliasToken) {
          const normalizedAlias = normalizeIdentifier(aliasToken.text);
          if (aliasSeen.has(normalizedAlias)) {
            pushDiagnostic(
              makeDiagnostic(
                {
                  code: "duplicate_alias",
                  severity: "warning",
                  message: `Alias \`${stripIdentifierQuotes(aliasToken.text)}\` is reused in the current statement.`,
                },
                analysis.statementOffset,
                aliasToken.start,
                aliasToken.end,
              ),
            );
          } else {
            aliasSeen.add(normalizedAlias);
          }
        }
        index = closeIndex;
        continue;
      }

      const relationRef = consumeRelationReference(tokens, cursor);
      if (!relationRef) continue;
      const relation = resolveRelation(
        analysis.relations,
        relationRef.schema,
        relationRef.relation,
        context.activeSchema,
      );
      if (!relation) {
        const start = tokens[cursor]!.start;
        const end = tokens[relationRef.nextIndex - 1]!.end;
        pushDiagnostic(
          makeDiagnostic(
            {
              code: "unknown_relation",
              severity: "error",
              message: `Unknown relation \`${relationRef.relation}\` in the current schema scope.`,
            },
            analysis.statementOffset,
            start,
            end,
          ),
        );
      }

      const aliasToken = readAliasToken(tokens, relationRef.nextIndex);
      if (aliasToken) {
        const normalizedAlias = normalizeIdentifier(aliasToken.text);
        if (aliasSeen.has(normalizedAlias)) {
          pushDiagnostic(
            makeDiagnostic(
              {
                code: "duplicate_alias",
                severity: "warning",
                message: `Alias \`${stripIdentifierQuotes(aliasToken.text)}\` is reused in the current statement.`,
              },
              analysis.statementOffset,
              aliasToken.start,
              aliasToken.end,
            ),
          );
        } else {
          aliasSeen.add(normalizedAlias);
        }
      } else if (relation) {
        aliasSeen.add(normalizeIdentifier(relation.name));
      }

      if (token.normalized === "JOIN") {
        const previous = previousToken(tokens, index);
        const requiresCondition =
          previous?.normalized !== "CROSS" && previous?.normalized !== "NATURAL";
        if (requiresCondition) {
          let hasJoinCondition = false;
          for (let lookahead = relationRef.nextIndex; lookahead < tokens.length; lookahead += 1) {
            const candidate = tokens[lookahead];
            if (!candidate || candidate.depth !== 0) continue;
            if (candidate.normalized === "ON" || candidate.normalized === "USING") {
              hasJoinCondition = true;
              break;
            }
            if (isClauseBoundaryToken(candidate)) break;
          }
          if (!hasJoinCondition) {
            pushDiagnostic(
              makeDiagnostic(
                {
                  code: "missing_join_condition",
                  severity: "warning",
                  message: "JOIN clause does not include ON or USING.",
                },
                analysis.statementOffset,
                token.start,
                tokens[relationRef.nextIndex - 1]!.end,
              ),
            );
          }
        }
      }

      index = relationRef.nextIndex - 1;
    }
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const qualifier = tokens[index];
    const dot = tokens[index + 1];
    const column = tokens[index + 2];
    if (
      qualifier?.kind !== "identifier" ||
      dot?.text !== "." ||
      column?.kind !== "identifier"
    ) {
      continue;
    }

    const binding =
      analysis.allBindings.find(
        (candidate) =>
          normalizeIdentifier(candidate.alias) === normalizeIdentifier(qualifier.text),
      ) ?? null;

    if (!binding) {
      pushDiagnostic(
        makeDiagnostic(
          {
            code: "unknown_qualifier",
            severity: "error",
            message: `Unknown alias or qualifier \`${stripIdentifierQuotes(qualifier.text)}\`.`,
          },
          analysis.statementOffset,
          qualifier.start,
          qualifier.end,
        ),
      );
      continue;
    }

    if (
      !binding.relation.columns.some(
        (candidate) => normalizeIdentifier(candidate) === normalizeIdentifier(column.text),
      )
    ) {
      pushDiagnostic(
        makeDiagnostic(
          {
            code: "unknown_column",
            severity: "error",
            message: `Column \`${stripIdentifierQuotes(column.text)}\` does not exist on \`${binding.alias}\`.`,
          },
          analysis.statementOffset,
          column.start,
          column.end,
        ),
      );
    }
  }

  const statementStart = analysis.statement.clauses[0]?.startOffset ?? 0;
  const hasWhere = analysis.statement.clauses.some((clause) => clause.clause === "where");
  if (analysis.statement.kind === "update" && !hasWhere) {
    pushDiagnostic(
      makeDiagnostic(
        {
          code: "update_without_where",
          severity: "warning",
          message: "UPDATE statement has no WHERE clause.",
        },
        analysis.statementOffset,
        statementStart,
        Math.min(analysis.statementSql.length, statementStart + 6),
      ),
    );
  }

  if (analysis.statement.kind === "delete" && !hasWhere) {
    pushDiagnostic(
      makeDiagnostic(
        {
          code: "delete_without_where",
          severity: "warning",
          message: "DELETE statement has no WHERE clause.",
        },
        analysis.statementOffset,
        statementStart,
        Math.min(analysis.statementSql.length, statementStart + 6),
      ),
    );
  }

  return diagnostics;
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

export function resolveSemanticHoverSymbol(
  context: SqlSemanticContext,
  sqlText: string,
  cursorOffset: number,
): SqlSemanticHoverSymbol | null {
  const analysis = analyzeSqlContext(context, sqlText, cursorOffset);
  const tokens = tokenizeSql(analysis.statementSql);
  if (tokens.length === 0) return null;

  const tokenIndex = findTokenIndexAtOffset(tokens, analysis.cursorOffsetInStatement);
  const token = tokens[tokenIndex];
  if (!token || token.kind !== "identifier") return null;

  const setRange = (
    symbol: SqlSemanticHoverSymbol,
    start: number,
    end: number,
  ): SqlSemanticHoverSymbol => ({
    ...symbol,
    startOffset: analysis.statementOffset + start,
    endOffset: analysis.statementOffset + end,
  });

  const previous = previousToken(tokens, tokenIndex);
  const previousPrevious = previous ? previousToken(tokens, tokenIndex - 1) : undefined;
  const next = nextToken(tokens, tokenIndex);
  const nextNext = next ? nextToken(tokens, tokenIndex + 1) : undefined;

  if (previous?.text === "." && previousPrevious?.kind === "identifier") {
    const qualifier = stripIdentifierQuotes(previousPrevious.text);
    const binding =
      analysis.allBindings.find(
        (candidate) =>
          normalizeIdentifier(candidate.alias) === normalizeIdentifier(qualifier),
      ) ?? null;
    if (binding) {
      return setRange(
        {
          kind: "column",
          label: stripIdentifierQuotes(token.text),
          detail: `column from ${binding.relation.name} (${binding.relation.kind})`,
          documentation: [
            `Qualifier: ${qualifier}`,
            `Schema: ${binding.relation.schema}`,
          ],
          startOffset: 0,
          endOffset: 0,
        },
        token.start,
        token.end,
      );
    }
  }

  if (next?.text === "." && nextNext?.kind === "identifier") {
    const alias = stripIdentifierQuotes(token.text);
    const binding =
      analysis.allBindings.find(
        (candidate) =>
          normalizeIdentifier(candidate.alias) === normalizeIdentifier(alias),
      ) ?? null;
    if (binding) {
      return setRange(describeRelation(binding.relation, alias), token.start, token.end);
    }
  }

  const aliasBinding =
    analysis.allBindings.find(
      (candidate) =>
        normalizeIdentifier(candidate.alias) === normalizeIdentifier(token.text),
    ) ?? null;
  if (aliasBinding) {
    return setRange(
      describeRelation(aliasBinding.relation, aliasBinding.alias),
      token.start,
      token.end,
    );
  }

  const relation = resolveRelation(
    analysis.relations,
    undefined,
    stripIdentifierQuotes(token.text),
    context.activeSchema,
  );
  if (relation) {
    return setRange(describeRelation(relation), token.start, token.end);
  }

  return null;
}

export function collectSemanticDiagnostics(
  context: SqlSemanticContext,
  sqlText: string,
): SqlSemanticDiagnostic[] {
  const diagnostics: SqlSemanticDiagnostic[] = [];
  for (const range of resolveStatementRanges(sqlText)) {
    const analysis = analyzeSqlContext(context, sqlText, range.endOffset);
    diagnostics.push(...collectStatementDiagnostics(context, analysis));
  }
  return diagnostics;
}
