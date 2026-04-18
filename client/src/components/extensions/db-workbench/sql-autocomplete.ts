import type {
  DbSchemaSnapshot,
  DbTableSchema,
} from "@shared/schema";

export type SqlCompletionKind =
  | "schema"
  | "table"
  | "view"
  | "column"
  | "keyword"
  | "template"
  | "function";

type SqlRelationKind = "table" | "view" | "cte" | "subquery";
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

type SqlTokenKind = "identifier" | "punctuation" | "number";

interface SqlToken {
  text: string;
  normalized: string;
  start: number;
  end: number;
  depth: number;
  kind: SqlTokenKind;
}

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

export interface SqlAutocompleteRelation {
  schema: string;
  name: string;
  kind: SqlRelationKind;
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
  activeSchema: string;
  schemas: string[];
  relations: SqlAutocompleteRelation[];
  columns: SqlAutocompleteColumn[];
  relationLookup: Record<string, SqlAutocompleteRelation>;
  selectedRelation: string | null;
  routines: SqlAutocompleteRoutine[];
  joinEdges: SqlAutocompleteJoinEdge[];
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
}

const IDENTIFIER_TOKEN =
  String.raw`(?:"[^"]+"|` + "`[^`]+`" + String.raw`|[A-Za-z_][\w$]*)`;

const CURSOR_ALIAS_PATTERN = new RegExp(
  String.raw`(${IDENTIFIER_TOKEN})\s*\.\s*[A-Za-z_0-9$"` + "`" + String.raw`]*$`,
  "i",
);

const QUALIFIED_IDENTIFIER_PATTERN = new RegExp(
  String.raw`^\s*(${IDENTIFIER_TOKEN})(?:\s*\.\s*(${IDENTIFIER_TOKEN}))?\s*$`,
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

const SQL_KEYWORD_ITEMS: Array<{
  label: string;
  insertText: string;
  detail: string;
  kind: "keyword" | "template";
  insertAsSnippet?: boolean;
}> = [
  { label: "SELECT", insertText: "SELECT ", detail: "keyword", kind: "keyword" },
  { label: "FROM", insertText: "FROM ", detail: "keyword", kind: "keyword" },
  { label: "WHERE", insertText: "WHERE ", detail: "keyword", kind: "keyword" },
  { label: "JOIN", insertText: "JOIN ", detail: "keyword", kind: "keyword" },
  { label: "GROUP BY", insertText: "GROUP BY ", detail: "keyword", kind: "keyword" },
  { label: "ORDER BY", insertText: "ORDER BY ", detail: "keyword", kind: "keyword" },
  { label: "INSERT", insertText: "INSERT INTO ", detail: "keyword", kind: "keyword" },
  { label: "UPDATE", insertText: "UPDATE ", detail: "keyword", kind: "keyword" },
  { label: "DELETE", insertText: "DELETE FROM ", detail: "keyword", kind: "keyword" },
  {
    label: "SELECT template",
    insertText: "SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition};",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
  {
    label: "INSERT template",
    insertText: "INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
  {
    label: "UPDATE template",
    insertText: "UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
  {
    label: "DELETE template",
    insertText: "DELETE FROM ${1:table}\nWHERE ${2:condition};",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
];

function stripIdentifierQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "`" && last === "`")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeIdentifier(value: string): string {
  return stripIdentifierQuotes(value).trim().toLowerCase();
}

function normalizeSchema(candidate: string | undefined, fallback: string): string {
  const normalized = candidate?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function toLookupKey(schema: string, relation: string): string {
  return `${normalizeIdentifier(schema)}.${normalizeIdentifier(relation)}`;
}

function parseQualifiedIdentifier(
  value: string,
): { schema?: string; relation: string } | null {
  const match = value.match(QUALIFIED_IDENTIFIER_PATTERN);
  if (!match) return null;

  if (match[2]) {
    return {
      schema: stripIdentifierQuotes(match[1]),
      relation: stripIdentifierQuotes(match[2]),
    };
  }

  return {
    relation: stripIdentifierQuotes(match[1]),
  };
}

function tokenizeSql(sqlText: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  let depth = 0;

  while (index < sqlText.length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === "-" && next === "-") {
      index += 2;
      while (index < sqlText.length && sqlText[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < sqlText.length - 1) {
        if (sqlText[index] === "*" && sqlText[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (current === "'") {
      index += 1;
      while (index < sqlText.length) {
        if (sqlText[index] === "'") {
          if (sqlText[index + 1] === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (current === '"') {
      const start = index;
      index += 1;
      while (index < sqlText.length) {
        if (sqlText[index] === '"') {
          if (sqlText[index + 1] === '"') {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: normalizeIdentifier(text).toUpperCase(),
        start,
        end: index,
        depth,
        kind: "identifier",
      });
      continue;
    }

    if (current === "`") {
      const start = index;
      index += 1;
      while (index < sqlText.length && sqlText[index] !== "`") {
        index += 1;
      }
      if (index < sqlText.length) index += 1;
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: normalizeIdentifier(text).toUpperCase(),
        start,
        end: index,
        depth,
        kind: "identifier",
      });
      continue;
    }

    if (current === "(") {
      tokens.push({
        text: current,
        normalized: current,
        start: index,
        end: index + 1,
        depth,
        kind: "punctuation",
      });
      depth += 1;
      index += 1;
      continue;
    }

    if (current === ")") {
      depth = Math.max(0, depth - 1);
      tokens.push({
        text: current,
        normalized: current,
        start: index,
        end: index + 1,
        depth,
        kind: "punctuation",
      });
      index += 1;
      continue;
    }

    if (current === "," || current === "." || current === ";") {
      tokens.push({
        text: current,
        normalized: current,
        start: index,
        end: index + 1,
        depth,
        kind: "punctuation",
      });
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(current)) {
      const start = index;
      index += 1;
      while (index < sqlText.length && /[A-Za-z0-9_$]/.test(sqlText[index])) {
        index += 1;
      }
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: text.toUpperCase(),
        start,
        end: index,
        depth,
        kind: "identifier",
      });
      continue;
    }

    if (/[0-9]/.test(current)) {
      const start = index;
      index += 1;
      while (index < sqlText.length && /[0-9_.]/.test(sqlText[index])) {
        index += 1;
      }
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: text,
        start,
        end: index,
        depth,
        kind: "number",
      });
      continue;
    }

    index += 1;
  }

  return tokens;
}

function previousToken(tokens: SqlToken[], index: number): SqlToken | undefined {
  return index > 0 ? tokens[index - 1] : undefined;
}

function nextToken(tokens: SqlToken[], index: number): SqlToken | undefined {
  return index + 1 < tokens.length ? tokens[index + 1] : undefined;
}

function findMatchingParen(tokens: SqlToken[], openIndex: number): number {
  let balance = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index]?.text === "(") balance += 1;
    if (tokens[index]?.text === ")") balance -= 1;
    if (balance === 0) return index;
  }
  return -1;
}

function splitTopLevelSegments(sqlText: string): string[] {
  const tokens = tokenizeSql(sqlText);
  if (tokens.length === 0) return [];

  const segments: string[] = [];
  let segmentStart = 0;

  for (const token of tokens) {
    if (token.text === "," && token.depth === 0) {
      const segment = sqlText.slice(segmentStart, token.start).trim();
      if (segment) segments.push(segment);
      segmentStart = token.end;
    }
  }

  const tail = sqlText.slice(segmentStart).trim();
  if (tail) segments.push(tail);
  return segments;
}

function resolveStatementWindow(sqlText: string, cursorOffset: number) {
  const tokens = tokenizeSql(sqlText);
  const safeCursor = Math.max(0, Math.min(cursorOffset, sqlText.length));
  let statementStart = 0;
  let statementEnd = sqlText.length;

  for (const token of tokens) {
    if (token.text === ";" && token.depth === 0 && token.start < safeCursor) {
      statementStart = token.end;
    } else if (token.text === ";" && token.depth === 0 && token.start >= safeCursor) {
      statementEnd = token.start;
      break;
    }
  }

  return {
    statementSql: sqlText.slice(statementStart, statementEnd),
    statementOffset: statementStart,
    cursorOffsetInStatement: safeCursor - statementStart,
  };
}

function relationToCompletionKind(relation: SqlAutocompleteRelation): SqlCompletionKind {
  if (relation.kind === "view" || relation.kind === "cte" || relation.kind === "subquery") {
    return "view";
  }
  return "table";
}

function buildRelationFromTable(
  table: DbTableSchema,
  activeSchema: string,
  fallbackSchema: string,
): SqlAutocompleteRelation | null {
  const parsed = parseQualifiedIdentifier(table.name);
  const schema = normalizeSchema(parsed?.schema, fallbackSchema);
  const relationName = parsed?.relation ?? table.name.trim();
  if (
    normalizeIdentifier(schema) !== normalizeIdentifier(activeSchema) ||
    !relationName
  ) {
    return null;
  }

  const uniqueColumns = new Set<string>();
  for (const column of table.columns) {
    const trimmed = column.name.trim();
    if (trimmed) uniqueColumns.add(trimmed);
  }

  return {
    schema,
    name: relationName,
    kind: "table",
    columns: Array.from(uniqueColumns).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function buildRelationFromView(
  view: DbSchemaSnapshot["views"][number],
  activeSchema: string,
  fallbackSchema: string,
): SqlAutocompleteRelation | null {
  const parsed = parseQualifiedIdentifier(view.name);
  const schema = normalizeSchema(parsed?.schema, fallbackSchema);
  const relationName = parsed?.relation ?? view.name.trim();
  if (
    normalizeIdentifier(schema) !== normalizeIdentifier(activeSchema) ||
    !relationName
  ) {
    return null;
  }

  const uniqueColumns = new Set<string>();
  for (const column of view.columns) {
    const trimmed = column.name.trim();
    if (trimmed) uniqueColumns.add(trimmed);
  }

  return {
    schema,
    name: relationName,
    kind: "view",
    columns: Array.from(uniqueColumns).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function buildRoutines(
  snapshot: DbSchemaSnapshot,
  activeSchema: string,
): SqlAutocompleteRoutine[] {
  const fallbackSchema = snapshot.schema?.trim() || activeSchema;
  const routines: SqlAutocompleteRoutine[] = [];

  for (const routine of snapshot.routines ?? []) {
    const parsed = parseQualifiedIdentifier(routine.name);
    const schema = normalizeSchema(parsed?.schema, fallbackSchema);
    const name = parsed?.relation ?? routine.name.trim();
    if (
      normalizeIdentifier(schema) !== normalizeIdentifier(activeSchema) ||
      !name
    ) {
      continue;
    }
    routines.push({
      schema,
      name,
      kind: routine.kind,
      signature: routine.signature,
      returnType: routine.returnType,
    });
  }

  return routines.sort((left, right) => left.name.localeCompare(right.name));
}

function buildJoinEdges(
  snapshot: DbSchemaSnapshot,
  relationLookup: Record<string, SqlAutocompleteRelation>,
  activeSchema: string,
): SqlAutocompleteJoinEdge[] {
  const edges: SqlAutocompleteJoinEdge[] = [];
  const fallbackSchema = snapshot.schema?.trim() || activeSchema;
  const seen = new Set<string>();

  for (const table of snapshot.tables ?? []) {
    const sourceParsed = parseQualifiedIdentifier(table.name);
    const sourceSchema = normalizeSchema(sourceParsed?.schema, fallbackSchema);
    const sourceRelation = sourceParsed?.relation ?? table.name.trim();
    const sourceLookup = relationLookup[toLookupKey(sourceSchema, sourceRelation)];
    if (!sourceLookup) continue;

    for (const foreignKey of table.foreignKeys ?? []) {
      const targetParsed = parseQualifiedIdentifier(foreignKey.referencedTable);
      const targetSchema = normalizeSchema(targetParsed?.schema, sourceSchema);
      const targetRelation =
        targetParsed?.relation ?? foreignKey.referencedTable.trim();
      const targetLookup = relationLookup[toLookupKey(targetSchema, targetRelation)];
      if (!targetLookup) continue;

      const edge: SqlAutocompleteJoinEdge = {
        sourceSchema,
        sourceRelation,
        targetSchema,
        targetRelation,
        sourceColumns: foreignKey.columns,
        targetColumns: foreignKey.referencedColumns,
        foreignKeyName: foreignKey.name,
      };
      const edgeKey = [
        toLookupKey(edge.sourceSchema, edge.sourceRelation),
        edge.sourceColumns.join(",").toLowerCase(),
        toLookupKey(edge.targetSchema, edge.targetRelation),
        edge.targetColumns.join(",").toLowerCase(),
      ].join("::");
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      edges.push(edge);
    }
  }

  return edges;
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
      new RegExp(String.raw`^(${IDENTIFIER_TOKEN})\s*\.\s*\*$`, "i"),
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

function isSelectedRelation(
  context: SqlAutocompleteContext,
  relationName: string,
): boolean {
  if (!context.selectedRelation) return false;
  return normalizeIdentifier(context.selectedRelation) === normalizeIdentifier(relationName);
}

function buildKeywordItems(scope: SqlCompletionScope): SqlCompletionItem[] {
  return SQL_KEYWORD_ITEMS.map((item, index) => {
    const prefix =
      scope === "general"
        ? "050"
        : scope === "relation"
          ? item.kind === "template"
            ? "970"
            : "960"
          : item.kind === "template"
            ? "930"
            : "920";

    return {
      label: item.label,
      insertText: item.insertText,
      kind: item.kind,
      detail: item.detail,
      sortText: `${prefix}-${String(index).padStart(4, "0")}-${item.label.toLowerCase()}`,
      insertAsSnippet: item.insertAsSnippet,
    };
  });
}

function buildFunctionItems(
  context: SqlAutocompleteContext,
  scope: SqlCompletionScope,
): SqlCompletionItem[] {
  if (scope === "relation") return [];

  return context.routines.map((routine, index) => ({
    label: routine.name,
    insertText:
      routine.kind === "procedure"
        ? `CALL ${routine.name}($1);`
        : `${routine.name}($1)`,
    kind: "function",
    detail:
      routine.signature ??
      `${routine.kind} (${routine.schema})${routine.returnType ? ` -> ${routine.returnType}` : ""}`,
    sortText: `${scope === "column" ? "120" : "110"}-${String(index).padStart(4, "0")}-${routine.name.toLowerCase()}`,
    insertAsSnippet: true,
  }));
}

function suggestRelationAlias(
  relationName: string,
  bindings: SqlAliasBinding[],
): string {
  const parts = relationName
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const base =
    parts.length > 1
      ? parts.map((part) => part[0]!.toLowerCase()).join("")
      : relationName[0]?.toLowerCase() || "t";
  const used = new Set(bindings.map((binding) => normalizeIdentifier(binding.alias)));
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function buildJoinCondition(
  leftQualifier: string,
  leftColumns: string[],
  rightQualifier: string,
  rightColumns: string[],
): string {
  return leftColumns
    .map(
      (column, index) =>
        `${leftQualifier}.${column} = ${rightQualifier}.${rightColumns[index] ?? rightColumns[0] ?? column}`,
    )
    .join(" AND ");
}

function buildJoinTemplateItems(
  context: SqlAutocompleteContext,
  cursor: SqlCursorContext,
): SqlCompletionItem[] {
  if (cursor.scope !== "relation" || cursor.clause !== "join" || cursor.bindings.length === 0) {
    return [];
  }

  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();
  const boundRelationKeys = new Set(
    cursor.bindings.map((binding) =>
      toLookupKey(binding.relation.schema, binding.relation.name),
    ),
  );

  const pushJoinItem = (
    relation: SqlAutocompleteRelation,
    insertText: string,
    detail: string,
  ) => {
    if (seen.has(insertText)) return;
    seen.add(insertText);
    items.push({
      label: `JOIN ${relation.name} via FK`,
      insertText,
      kind: "template",
      detail,
      sortText: `140-${String(items.length).padStart(4, "0")}-${relation.name.toLowerCase()}`,
    });
  };

  for (let bindingIndex = cursor.bindings.length - 1; bindingIndex >= 0; bindingIndex -= 1) {
    const binding = cursor.bindings[bindingIndex]!;
    const bindingKey = toLookupKey(binding.relation.schema, binding.relation.name);

    for (const edge of context.joinEdges) {
      const sourceKey = toLookupKey(edge.sourceSchema, edge.sourceRelation);
      const targetKey = toLookupKey(edge.targetSchema, edge.targetRelation);

      if (bindingKey === sourceKey && !boundRelationKeys.has(targetKey)) {
        const target = context.relationLookup[targetKey];
        if (!target) continue;
        const alias = suggestRelationAlias(target.name, cursor.bindings);
        pushJoinItem(
          target,
          `${target.name} ${alias} ON ${buildJoinCondition(
            binding.alias,
            edge.sourceColumns,
            alias,
            edge.targetColumns,
          )}`,
          `${edge.foreignKeyName}: ${binding.relation.name} -> ${target.name}`,
        );
      }

      if (bindingKey === targetKey && !boundRelationKeys.has(sourceKey)) {
        const source = context.relationLookup[sourceKey];
        if (!source) continue;
        const alias = suggestRelationAlias(source.name, cursor.bindings);
        pushJoinItem(
          source,
          `${source.name} ${alias} ON ${buildJoinCondition(
            alias,
            edge.sourceColumns,
            binding.alias,
            edge.targetColumns,
          )}`,
          `${edge.foreignKeyName}: ${source.name} -> ${binding.relation.name}`,
        );
      }
    }
  }

  return items;
}

function buildRelationItems(
  context: SqlAutocompleteContext,
  cursor: SqlCursorContext,
): SqlCompletionItem[] {
  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();
  const visibleRelationKeys = new Set(
    cursor.bindings.map((binding) =>
      toLookupKey(binding.relation.schema, binding.relation.name),
    ),
  );
  let order = 0;

  const allRelations = [...cursor.relations].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.name.localeCompare(right.name);
  });

  for (const relation of allRelations) {
    const key = toLookupKey(relation.schema, relation.name);
    if (seen.has(key)) continue;
    seen.add(key);

    const relationPrefix =
      cursor.scope === "relation"
        ? relation.kind === "cte"
          ? "150"
          : visibleRelationKeys.has(key)
            ? "170"
            : isSelectedRelation(context, relation.name)
              ? "180"
              : "210"
        : relation.kind === "cte"
          ? "260"
          : isSelectedRelation(context, relation.name)
            ? "270"
            : "290";

    items.push({
      label: relation.name,
      insertText: relation.name,
      kind: relationToCompletionKind(relation),
      detail:
        relation.kind === "cte"
          ? "cte"
          : relation.kind === "subquery"
            ? "subquery"
            : `${relation.kind} (${relation.schema})`,
      sortText: `${relationPrefix}-${String(order).padStart(4, "0")}-${relation.name.toLowerCase()}`,
    });
    order += 1;
  }

  return items;
}

function buildColumnItems(
  context: SqlAutocompleteContext,
  cursor: SqlCursorContext,
): SqlCompletionItem[] {
  const items: SqlCompletionItem[] = [];
  const preferredBindings = cursor.bindings;
  const preferredLookup = new Set(
    preferredBindings.map((binding) =>
      toLookupKey(binding.relation.schema, binding.relation.name),
    ),
  );
  const seen = new Set<string>();
  let order = 0;

  const appendColumn = (
    relation: SqlAutocompleteRelation,
    columnName: string,
    prefix: string,
  ) => {
    const identity = `${toLookupKey(relation.schema, relation.name)}::${normalizeIdentifier(columnName)}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    items.push({
      label: columnName,
      insertText: columnName,
      kind: "column",
      detail: `${relation.name} (${relation.schema})`,
      sortText: `${prefix}-${String(order).padStart(4, "0")}-${columnName.toLowerCase()}`,
    });
    order += 1;
  };

  if (preferredBindings.length > 0) {
    for (const binding of preferredBindings) {
      for (const columnName of binding.relation.columns) {
        appendColumn(binding.relation, columnName, "220");
      }
    }
  }

  for (const column of context.columns) {
    const relation = context.relationLookup[toLookupKey(column.schema, column.relation)];
    if (!relation) continue;
    const prefix =
      preferredLookup.size > 0
        ? preferredLookup.has(toLookupKey(column.schema, column.relation))
          ? "225"
          : "260"
        : isSelectedRelation(context, column.relation)
          ? "240"
          : "280";
    appendColumn(relation, column.name, prefix);
  }

  return items;
}

export function buildAutocompleteContext(
  snapshot: DbSchemaSnapshot | null | undefined,
  activeSchema: string | undefined,
  selectedRelationName?: string | null,
): SqlAutocompleteContext {
  const fallbackSchema =
    activeSchema?.trim() || snapshot?.schema?.trim() || "public";
  const normalizedActiveSchema = normalizeSchema(activeSchema, fallbackSchema);
  const selectedRelation =
    typeof selectedRelationName === "string" && selectedRelationName.trim()
      ? selectedRelationName.trim()
      : null;

  if (!snapshot) {
    return {
      activeSchema: normalizedActiveSchema,
      schemas: [normalizedActiveSchema],
      relations: [],
      columns: [],
      relationLookup: {},
      selectedRelation,
      routines: [],
      joinEdges: [],
    };
  }

  const relations: SqlAutocompleteRelation[] = [];
  const relationLookup: Record<string, SqlAutocompleteRelation> = {};
  const columns: SqlAutocompleteColumn[] = [];
  const schemas = new Set<string>([normalizedActiveSchema]);

  for (const table of snapshot.tables ?? []) {
    const relation = buildRelationFromTable(
      table,
      normalizedActiveSchema,
      snapshot.schema?.trim() || normalizedActiveSchema,
    );
    if (!relation) continue;
    relations.push(relation);
    relationLookup[toLookupKey(relation.schema, relation.name)] = relation;
    schemas.add(relation.schema);
    for (const column of relation.columns) {
      columns.push({
        schema: relation.schema,
        relation: relation.name,
        name: column,
      });
    }
  }

  for (const view of snapshot.views ?? []) {
    const relation = buildRelationFromView(
      view,
      normalizedActiveSchema,
      snapshot.schema?.trim() || normalizedActiveSchema,
    );
    if (!relation) continue;
    relations.push(relation);
    relationLookup[toLookupKey(relation.schema, relation.name)] = relation;
    schemas.add(relation.schema);
    for (const column of relation.columns) {
      columns.push({
        schema: relation.schema,
        relation: relation.name,
        name: column,
      });
    }
  }

  relations.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.name.localeCompare(right.name);
  });
  columns.sort((left, right) => {
    if (left.name !== right.name) return left.name.localeCompare(right.name);
    if (left.relation !== right.relation) {
      return left.relation.localeCompare(right.relation);
    }
    return left.schema.localeCompare(right.schema);
  });

  return {
    activeSchema: normalizedActiveSchema,
    schemas: Array.from(schemas).sort((left, right) => left.localeCompare(right)),
    relations,
    columns,
    relationLookup,
    selectedRelation,
    routines: buildRoutines(snapshot, normalizedActiveSchema),
    joinEdges: buildJoinEdges(snapshot, relationLookup, normalizedActiveSchema),
  };
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
  const cursor = resolveCursorContext(context, sqlText, cursorOffset);
  const aliasBinding =
    resolveAliasBindingAtCursor(
      cursor.statementSql,
      cursor.cursorOffsetInStatement,
      cursor.relations,
      context.activeSchema,
    ) ??
    (aliasHint
      ? (() => {
          const relation = findRelationForAlias(context, aliasHint);
          return relation ? { alias: aliasHint.alias, relation } : null;
        })()
      : null);

  if (aliasBinding) {
    return aliasBinding.relation.columns.map((columnName, index) => ({
      label: columnName,
      insertText: columnName,
      kind: "column",
      detail: `${aliasBinding.relation.name} (${aliasBinding.relation.kind})`,
      sortText: `001-${String(index).padStart(4, "0")}-${columnName.toLowerCase()}`,
    }));
  }

  const items: SqlCompletionItem[] = [];
  items.push(...buildKeywordItems(cursor.scope));
  items.push(...buildFunctionItems(context, cursor.scope));
  items.push(...buildJoinTemplateItems(context, cursor));
  items.push(...buildRelationItems(context, cursor));

  if (cursor.scope !== "relation") {
    items.push(...buildColumnItems(context, cursor));
  }

  for (let index = 0; index < context.schemas.length; index += 1) {
    const schemaName = context.schemas[index]!;
    items.push({
      label: schemaName,
      insertText: schemaName,
      kind: "schema",
      detail: "schema",
      sortText: `400-${String(index).padStart(4, "0")}-${schemaName.toLowerCase()}`,
    });
  }

  return items.sort((left, right) => left.sortText.localeCompare(right.sortText));
}
