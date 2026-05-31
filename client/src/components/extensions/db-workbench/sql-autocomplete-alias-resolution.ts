import {
  SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE,
  normalizeIdentifier,
  resolveStatementWindow,
  stripIdentifierQuotes,
  tokenizeSql,
  toLookupKey,
  type SqlToken,
} from "./sql-lexer";
import type {
  SqlAutocompleteAliasHint,
  SqlAutocompleteContext,
  SqlAutocompleteRelation,
} from "./sql-autocomplete-types";

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

function resolveRelation(
  relations: SqlAutocompleteRelation[],
  schema: string | undefined,
  relationName: string,
  activeSchema: string,
): SqlAutocompleteRelation | null {
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

export function resolveAutocompleteAliasRelation(
  context: SqlAutocompleteContext,
  aliasHint: SqlAutocompleteAliasHint,
): SqlAutocompleteRelation | null {
  return resolveRelation(
    context.relations,
    aliasHint.schema,
    aliasHint.table,
    context.activeSchema,
  );
}

export function resolveTableAlias(
  sqlText: string,
  cursorOffset: number,
): SqlAutocompleteAliasHint | null {
  const statement = resolveStatementWindow(sqlText, cursorOffset);
  const safeOffset = Math.max(
    0,
    Math.min(statement.cursorOffsetInStatement, statement.statementSql.length),
  );
  const sqlBeforeCursor = statement.statementSql.slice(0, safeOffset);
  const aliasCursorMatch = sqlBeforeCursor.match(CURSOR_ALIAS_PATTERN);
  if (!aliasCursorMatch) return null;

  const aliasAtCursor = stripIdentifierQuotes(aliasCursorMatch[1]!);
  const tokens = tokenizeSql(statement.statementSql);

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

    const relationRef = consumeRelationReference(tokens, index + 1);
    if (!relationRef) continue;
    const aliasToken = readAliasToken(tokens, relationRef.nextIndex);
    const relationAlias = aliasToken
      ? stripIdentifierQuotes(aliasToken.text)
      : relationRef.relation;

    if (normalizeIdentifier(relationAlias) !== normalizeIdentifier(aliasAtCursor)) {
      index = relationRef.nextIndex - 1;
      continue;
    }

    return {
      alias: aliasAtCursor,
      table: relationRef.relation,
      schema: relationRef.schema,
    };
  }

  return {
    alias: aliasAtCursor,
    table: aliasAtCursor,
  };
}
