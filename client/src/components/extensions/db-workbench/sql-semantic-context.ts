import {
  SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE,
  findMatchingParen,
  nextToken,
  normalizeIdentifier,
  normalizeSchema,
  parseQualifiedIdentifier,
  previousToken,
  resolveStatementWindow,
  splitTopLevelSegments,
  stripIdentifierQuotes,
  tokenizeSql,
  toLookupKey,
  type SqlToken,
} from "./sql-lexer";
import type {
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

const CURSOR_ALIAS_PATTERN = new RegExp(
  String.raw`(${SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE})\s*\.\s*[A-Za-z_0-9$"` + "`" + String.raw`]*$`,
  "i",
);

const RESERVED_ALIAS_STOPWORDS = new Set([
  "select",
  "from",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "on",
  "where",
  "group",
  "order",
  "by",
  "having",
  "limit",
  "offset",
  "union",
  "except",
  "intersect",
  "set",
  "returning",
  "update",
  "into",
  "values",
  "as",
  "with",
  "recursive",
]);

function resolveRelation(
  relations: SqlSemanticRelation[],
  schema: string | undefined,
  relationName: string,
  activeSchema: string,
): SqlSemanticRelation | null {
  if (schema) {
    return (
      relations.find(
        (relation) =>
          toLookupKey(relation.schema, relation.name) ===
          toLookupKey(schema, relationName),
      ) ?? null
    );
  }

  const preferred = relations.find(
    (relation) =>
      toLookupKey(relation.schema, relation.name) ===
      toLookupKey(activeSchema, relationName),
  );
  if (preferred) return preferred;

  const normalizedName = normalizeIdentifier(relationName);
  return (
    relations.find(
      (relation) => normalizeIdentifier(relation.name) === normalizedName,
    ) ?? null
  );
}

function createCteRelation(
  name: string,
  columns: string[],
  activeSchema: string,
): SqlSemanticRelation {
  return {
    schema: activeSchema,
    name,
    kind: "cte",
    columns: Array.from(
      new Set(columns.map((column) => column.trim()).filter(Boolean)),
    ),
  };
}

function consumeRelationReference(
  tokens: SqlToken[],
  startIndex: number,
): { schema?: string; relation: string; nextIndex: number } | null {
  const first = tokens[startIndex];
  if (!first || first.kind !== "identifier") return null;

  const dot = tokens[startIndex + 1];
  const second = tokens[startIndex + 2];
  if (dot?.text === "." && second?.kind === "identifier") {
    return {
      schema: stripIdentifierQuotes(first.text),
      relation: stripIdentifierQuotes(second.text),
      nextIndex: startIndex + 3,
    };
  }

  return {
    relation: stripIdentifierQuotes(first.text),
    nextIndex: startIndex + 1,
  };
}

function readAliasToken(tokens: SqlToken[], startIndex: number): SqlToken | null {
  let index = startIndex;
  if (tokens[index]?.normalized === "AS") {
    index += 1;
  }
  const token = tokens[index];
  if (!token || token.kind !== "identifier") return null;
  if (RESERVED_ALIAS_STOPWORDS.has(normalizeIdentifier(token.text))) {
    return null;
  }
  return token;
}

function parseStatementCtes(
  statementSql: string,
  availableRelations: SqlSemanticRelation[],
  activeSchema: string,
): { relations: SqlSemanticRelation[]; mainSqlOffset: number } {
  const tokens = tokenizeSql(statementSql);
  if (tokens[0]?.normalized !== "WITH") {
    return { relations: [], mainSqlOffset: 0 };
  }

  const ctes: SqlSemanticRelation[] = [];
  let index = 1;
  if (tokens[index]?.normalized === "RECURSIVE") {
    index += 1;
  }

  while (index < tokens.length) {
    const nameToken = tokens[index];
    if (!nameToken || nameToken.kind !== "identifier") {
      return { relations: ctes, mainSqlOffset: nameToken?.start ?? 0 };
    }
    const cteName = stripIdentifierQuotes(nameToken.text);
    index += 1;

    let declaredColumns: string[] = [];
    if (tokens[index]?.text === "(") {
      const columnClose = findMatchingParen(tokens, index);
      if (columnClose < 0) {
        return { relations: ctes, mainSqlOffset: statementSql.length };
      }
      declaredColumns = tokens
        .slice(index + 1, columnClose)
        .filter((token) => token.kind === "identifier")
        .map((token) => stripIdentifierQuotes(token.text));
      index = columnClose + 1;
    }

    if (tokens[index]?.normalized !== "AS" || tokens[index + 1]?.text !== "(") {
      return {
        relations: ctes,
        mainSqlOffset: tokens[index]?.start ?? statementSql.length,
      };
    }

    const bodyOpen = index + 1;
    const bodyClose = findMatchingParen(tokens, bodyOpen);
    if (bodyClose < 0) {
      return { relations: ctes, mainSqlOffset: statementSql.length };
    }

    const bodySql = statementSql.slice(tokens[bodyOpen]!.end, tokens[bodyClose]!.start);
    const inferredColumns =
      declaredColumns.length > 0
        ? declaredColumns
        : inferProjectedColumns(bodySql, [...availableRelations, ...ctes], activeSchema);
    ctes.push(createCteRelation(cteName, inferredColumns, activeSchema));
    index = bodyClose + 1;

    if (tokens[index]?.text === ",") {
      index += 1;
      continue;
    }

    return {
      relations: ctes,
      mainSqlOffset: tokens[index]?.start ?? statementSql.length,
    };
  }

  return { relations: ctes, mainSqlOffset: statementSql.length };
}

function collectVisibleRelationBindings(
  statementSql: string,
  availableRelations: SqlSemanticRelation[],
  activeSchema: string,
  cursorOffset = statementSql.length,
): SqlSemanticBinding[] {
  const prefixSql = statementSql.slice(
    0,
    Math.max(0, Math.min(cursorOffset, statementSql.length)),
  );
  const tokens = tokenizeSql(prefixSql);
  const bindings: SqlSemanticBinding[] = [];
  const seenAliases = new Set<string>();

  const pushBinding = (alias: string, relation: SqlSemanticRelation) => {
    const normalizedAlias = normalizeIdentifier(alias);
    if (!normalizedAlias || seenAliases.has(normalizedAlias)) return;
    seenAliases.add(normalizedAlias);
    bindings.push({ alias, relation });
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.depth !== 0 || token.kind !== "identifier") continue;
    if (
      token.normalized !== "FROM" &&
      token.normalized !== "JOIN" &&
      token.normalized !== "UPDATE" &&
      token.normalized !== "INTO"
    ) {
      continue;
    }

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
      if (!aliasToken) {
        index = closeIndex;
        continue;
      }

      const subquerySql = prefixSql.slice(startToken.end, tokens[closeIndex]!.start);
      const relation: SqlSemanticRelation = {
        schema: activeSchema,
        name: stripIdentifierQuotes(aliasToken.text),
        kind: "subquery",
        columns: inferProjectedColumns(
          subquerySql,
          availableRelations,
          activeSchema,
        ),
      };
      pushBinding(stripIdentifierQuotes(aliasToken.text), relation);
      index = closeIndex;
      continue;
    }

    const relationRef = consumeRelationReference(tokens, cursor);
    if (!relationRef) continue;
    const relation = resolveRelation(
      availableRelations,
      relationRef.schema,
      relationRef.relation,
      activeSchema,
    );
    if (!relation) {
      index = relationRef.nextIndex - 1;
      continue;
    }

    const aliasToken = readAliasToken(tokens, relationRef.nextIndex);
    pushBinding(
      aliasToken ? stripIdentifierQuotes(aliasToken.text) : relation.name,
      relation,
    );
    index = relationRef.nextIndex - 1;
  }

  return bindings;
}

function inferProjectedColumns(
  sqlText: string,
  availableRelations: SqlSemanticRelation[],
  activeSchema: string,
): string[] {
  const { statementSql } = resolveStatementWindow(sqlText, sqlText.length);
  const ctes = parseStatementCtes(statementSql, availableRelations, activeSchema);
  const relations = [...availableRelations, ...ctes.relations];
  const mainSql = statementSql.slice(ctes.mainSqlOffset).trim();
  if (!mainSql) return [];

  const tokens = tokenizeSql(mainSql);
  const selectIndex = tokens.findIndex(
    (token) => token.depth === 0 && token.normalized === "SELECT",
  );
  if (selectIndex < 0) return [];

  let fromIndex = -1;
  for (let index = selectIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.depth !== 0) continue;
    if (
      token.normalized === "FROM" ||
      token.normalized === "INTO" ||
      token.normalized === "UPDATE"
    ) {
      fromIndex = index;
      break;
    }
  }

  const selectListSql =
    fromIndex >= 0
      ? mainSql.slice(tokens[selectIndex]!.end, tokens[fromIndex]!.start)
      : mainSql.slice(tokens[selectIndex]!.end);
  const segments = splitTopLevelSegments(selectListSql);
  const bindings = collectVisibleRelationBindings(
    mainSql,
    relations,
    activeSchema,
    mainSql.length,
  );
  const bindingLookup = new Map(
    bindings.map((binding) => [
      normalizeIdentifier(binding.alias),
      binding.relation,
    ]),
  );
  const output = new Set<string>();

  const appendColumn = (name: string) => {
    const trimmed = name.trim();
    if (trimmed) output.add(trimmed);
  };

  const appendRelationColumns = (relation: SqlSemanticRelation | null) => {
    if (!relation) return;
    for (const column of relation.columns) appendColumn(column);
  };

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    if (trimmed === "*") {
      for (const binding of bindings) appendRelationColumns(binding.relation);
      continue;
    }

    const qualifiedStar = trimmed.match(
      new RegExp(String.raw`^(${SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE})\s*\.\s*\*$`, "i"),
    );
    if (qualifiedStar) {
      const alias = normalizeIdentifier(qualifiedStar[1]!);
      appendRelationColumns(bindingLookup.get(alias) ?? null);
      continue;
    }

    const segmentTokens = tokenizeSql(trimmed);
    const asIndex = segmentTokens.findIndex(
      (token) => token.depth === 0 && token.normalized === "AS",
    );
    if (asIndex >= 0 && segmentTokens[asIndex + 1]?.kind === "identifier") {
      appendColumn(stripIdentifierQuotes(segmentTokens[asIndex + 1]!.text));
      continue;
    }

    const lastIdentifier = [...segmentTokens]
      .reverse()
      .find((token) => token.kind === "identifier");
    if (!lastIdentifier) continue;

    const lastIndex = segmentTokens.lastIndexOf(lastIdentifier);
    const previous = previousToken(segmentTokens, lastIndex);
    if (previous?.text === ".") {
      appendColumn(stripIdentifierQuotes(lastIdentifier.text));
      continue;
    }

    appendColumn(stripIdentifierQuotes(lastIdentifier.text));
  }

  return Array.from(output);
}

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

function resolveMemberAccess(
  statementSql: string,
  cursorOffsetInStatement: number,
  bindings: SqlSemanticBinding[],
): SqlMemberAccess | null {
  const safeOffset = Math.max(0, Math.min(cursorOffsetInStatement, statementSql.length));
  const sqlBeforeCursor = statementSql.slice(0, safeOffset);
  const aliasCursorMatch = sqlBeforeCursor.match(CURSOR_ALIAS_PATTERN);
  if (!aliasCursorMatch) return null;

  const aliasAtCursor = stripIdentifierQuotes(aliasCursorMatch[1]!);
  const binding =
    bindings.find(
      (candidate) =>
        normalizeIdentifier(candidate.alias) === normalizeIdentifier(aliasAtCursor),
    ) ?? null;

  return {
    alias: aliasAtCursor,
    binding,
  };
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
