import {
  analyzeSqlContext,
} from "./sql-semantic-context";
import type { SqlSemanticAnalysis } from "./sql-semantic-types";
import {
  SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE,
  findMatchingParen,
  nextToken,
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
  SqlAutocompleteAliasHint,
  SqlAutocompleteContext,
  SqlAutocompleteRelation,
  SqlCompletionItem,
} from "./sql-autocomplete-types";
import { sortCompletionItemsWithMemory } from "./sql-autocomplete-memory-ranking";
import {
  buildColumnItems,
  buildFunctionItems,
  buildJoinConditionItems,
  buildJoinTemplateItems,
  buildKeywordItems,
  buildRelationItems,
  buildSchemaItems,
  buildTypeItems,
} from "./sql-autocomplete-item-builders";

export { resolveSemanticHoverSymbol } from "./sql-semantic-context";
export { buildAutocompleteContext } from "./sql-autocomplete-context";
export type {
  SqlAutocompleteAliasHint,
  SqlAutocompleteColumn,
  SqlAutocompleteContext,
  SqlAutocompleteJoinEdge,
  SqlAutocompleteRelation,
  SqlAutocompleteRoutine,
  SqlCompletionItem,
  SqlCompletionKind,
} from "./sql-autocomplete-types";

type SqlCompletionScope = "general" | "relation" | "column";
type SqlClauseContext =
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
  | "set"
  | "returning";

interface SqlAliasBinding {
  alias: string;
  relation: SqlAutocompleteRelation;
}

interface SqlCursorContext {
  clause: SqlClauseContext;
  scope: SqlCompletionScope;
  statementSql: string;
  statementOffset: number;
  cursorOffsetInStatement: number;
  relations: SqlAutocompleteRelation[];
  bindings: SqlAliasBinding[];
}

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
  const byName = relations.filter(
    (relation) => normalizeIdentifier(relation.name) === normalizedName,
  );
  return byName[0] ?? null;
}

function createCteRelation(
  name: string,
  columns: string[],
  activeSchema: string,
): SqlAutocompleteRelation {
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
  availableRelations: SqlAutocompleteRelation[],
  activeSchema: string,
): { relations: SqlAutocompleteRelation[]; mainSqlOffset: number } {
  const tokens = tokenizeSql(statementSql);
  if (tokens[0]?.normalized !== "WITH") {
    return { relations: [], mainSqlOffset: 0 };
  }

  const ctes: SqlAutocompleteRelation[] = [];
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
  availableRelations: SqlAutocompleteRelation[],
  activeSchema: string,
  cursorOffset = statementSql.length,
): SqlAliasBinding[] {
  const prefixSql = statementSql.slice(
    0,
    Math.max(0, Math.min(cursorOffset, statementSql.length)),
  );
  const tokens = tokenizeSql(prefixSql);
  const bindings: SqlAliasBinding[] = [];
  const seenAliases = new Set<string>();

  const pushBinding = (alias: string, relation: SqlAutocompleteRelation) => {
    const normalizedAlias = normalizeIdentifier(alias);
    if (!normalizedAlias || seenAliases.has(normalizedAlias)) return;
    seenAliases.add(normalizedAlias);
    bindings.push({
      alias,
      relation,
    });
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
      const relation: SqlAutocompleteRelation = {
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
  availableRelations: SqlAutocompleteRelation[],
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

  const appendRelationColumns = (relation: SqlAutocompleteRelation | null) => {
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

function resolveCursorContext(
  context: SqlAutocompleteContext,
  sqlText: string,
  cursorOffset: number,
): SqlCursorContext {
  const statement = resolveStatementWindow(sqlText, cursorOffset);
  const statementSql = statement.statementSql;
  const statementPrefix = statementSql.slice(0, statement.cursorOffsetInStatement);
  const statementTokens = tokenizeSql(statementPrefix);
  const ctes = parseStatementCtes(statementSql, context.relations, context.activeSchema);
  const relations = [...context.relations, ...ctes.relations];
  let clause: SqlClauseContext = "general";

  for (let index = 0; index < statementTokens.length; index += 1) {
    const token = statementTokens[index];
    if (!token || token.depth !== 0 || token.kind !== "identifier") continue;

    if (token.normalized === "GROUP" && nextToken(statementTokens, index)?.normalized === "BY") {
      clause = "group-by";
      index += 1;
      continue;
    }

    if (token.normalized === "ORDER" && nextToken(statementTokens, index)?.normalized === "BY") {
      clause = "order-by";
      index += 1;
      continue;
    }

    switch (token.normalized) {
      case "SELECT":
        clause = "select";
        break;
      case "FROM":
        clause = "from";
        break;
      case "JOIN":
        clause = "join";
        break;
      case "ON":
        clause = "on";
        break;
      case "WHERE":
        clause = "where";
        break;
      case "HAVING":
        clause = "having";
        break;
      case "UPDATE":
        clause = "update";
        break;
      case "INTO":
        clause = "into";
        break;
      case "SET":
        clause = "set";
        break;
      case "RETURNING":
        clause = "returning";
        break;
      default:
        break;
    }
  }

  const scope: SqlCompletionScope =
    clause === "from" || clause === "join" || clause === "update" || clause === "into"
      ? "relation"
      : clause === "general"
        ? "general"
        : "column";

  return {
    clause,
    scope,
    statementSql,
    statementOffset: statement.statementOffset,
    cursorOffsetInStatement: statement.cursorOffsetInStatement,
    relations,
    bindings: collectVisibleRelationBindings(
      statementSql,
      relations,
      context.activeSchema,
      statement.cursorOffsetInStatement,
    ),
  };
}

function resolveAliasBindingAtCursor(
  sqlText: string,
  cursorOffset: number,
  availableRelations: SqlAutocompleteRelation[],
  activeSchema: string,
): SqlAliasBinding | null {
  const safeOffset = Math.max(0, Math.min(cursorOffset, sqlText.length));
  const sqlBeforeCursor = sqlText.slice(0, safeOffset);
  const aliasCursorMatch = sqlBeforeCursor.match(CURSOR_ALIAS_PATTERN);
  if (!aliasCursorMatch) return null;

  const aliasAtCursor = stripIdentifierQuotes(aliasCursorMatch[1]!);
  const bindings = collectVisibleRelationBindings(
    sqlText,
    availableRelations,
    activeSchema,
    sqlText.length,
  );
  return (
    bindings.find(
      (binding) =>
        normalizeIdentifier(binding.alias) === normalizeIdentifier(aliasAtCursor),
    ) ?? null
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

function findRelationForAlias(
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

export function buildCompletionItems(
  context: SqlAutocompleteContext,
  aliasHint: SqlAutocompleteAliasHint | null,
  sqlText = "",
  cursorOffset = sqlText.length,
): SqlCompletionItem[] {
  const analysis = analyzeSqlContext(context, sqlText, cursorOffset);
  const aliasBinding =
    analysis.activeBinding ??
    (aliasHint
      ? (() => {
          const relation = findRelationForAlias(context, aliasHint);
          return relation ? { alias: aliasHint.alias, relation } : null;
        })()
      : null);

  if (aliasBinding) {
    return sortCompletionItemsWithMemory(
      context,
      analysis,
      aliasBinding.relation.columns.map((columnName, index) => ({
        label: columnName,
        insertText: columnName,
        kind: "column",
        detail: `${aliasBinding.relation.name} (${aliasBinding.relation.kind})`,
        sortText: `001-${String(index).padStart(4, "0")}-${columnName.toLowerCase()}`,
        schema: aliasBinding.relation.schema,
        relation: aliasBinding.relation.name,
        column: columnName,
        acceptedSuggestion: {
          label: columnName,
          kind: "column",
          schema: aliasBinding.relation.schema,
          relation: aliasBinding.relation.name,
          column: columnName,
        },
      })),
    );
  }

  const items: SqlCompletionItem[] = [];
  items.push(...buildKeywordItems(analysis.scope));
  items.push(...buildFunctionItems(context, analysis.scope));
  items.push(...buildTypeItems(context, analysis.scope));
  items.push(...buildJoinTemplateItems(context, analysis));
  items.push(...buildJoinConditionItems(context, analysis));
  items.push(...buildRelationItems(context, analysis));

  if (analysis.scope !== "relation") {
    items.push(...buildColumnItems(context, analysis));
  }

  items.push(...buildSchemaItems(context, analysis));

  return sortCompletionItemsWithMemory(context, analysis, items);
}
