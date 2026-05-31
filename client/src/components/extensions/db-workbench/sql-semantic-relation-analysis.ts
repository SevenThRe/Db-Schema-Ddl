import {
  SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE,
  findMatchingParen,
  normalizeIdentifier,
  previousToken,
  resolveStatementWindow,
  splitTopLevelSegments,
  stripIdentifierQuotes,
  tokenizeSql,
  toLookupKey,
  type SqlToken,
} from "./sql-lexer";
import type {
  SqlMemberAccess,
  SqlSemanticBinding,
  SqlSemanticRelation,
} from "./sql-semantic-types";

const CURSOR_ALIAS_PATTERN = new RegExp(
  String.raw`(${SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE})\s*\.\s*[A-Za-z_0-9$"` +
    "`" +
    String.raw`]*$`,
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

export function resolveRelation(
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

export function consumeRelationReference(
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

export function readAliasToken(
  tokens: SqlToken[],
  startIndex: number,
): SqlToken | null {
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

export function parseStatementCtes(
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

export function collectVisibleRelationBindings(
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

export function inferProjectedColumns(
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

export function resolveMemberAccess(
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
