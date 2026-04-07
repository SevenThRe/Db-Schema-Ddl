import type { DbSchemaSnapshot } from "@shared/schema";

export type SqlCompletionKind = "schema" | "table" | "view" | "column";

export interface SqlAutocompleteRelation {
  schema: string;
  name: string;
  kind: "table" | "view";
  columns: string[];
}

export interface SqlAutocompleteColumn {
  schema: string;
  relation: string;
  name: string;
}

export interface SqlAutocompleteContext {
  activeSchema: string;
  schemas: string[];
  relations: SqlAutocompleteRelation[];
  columns: SqlAutocompleteColumn[];
  relationLookup: Record<string, SqlAutocompleteRelation>;
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
}

const IDENTIFIER_TOKEN = String.raw`(?:"[^"]+"|` + "`[^`]+`" + String.raw`|[A-Za-z_][\w$]*)`;

// Alias patterns intentionally include:
// - FROM <table> <alias>
// - JOIN <table> <alias>
// - FROM <schema>.<table> <alias>
const TABLE_ALIAS_PATTERN = new RegExp(
  String.raw`\b(?:from|join)\s+((?:${IDENTIFIER_TOKEN}\s*\.\s*)?${IDENTIFIER_TOKEN})\s+(?:as\s+)?([A-Za-z_][\w$]*)`,
  "gi",
);

const CURSOR_ALIAS_PATTERN = /([A-Za-z_][\w$]*)\s*\.\s*[A-Za-z_0-9$]*$/i;
const QUALIFIED_IDENTIFIER_PATTERN = new RegExp(
  String.raw`^\s*(${IDENTIFIER_TOKEN})(?:\s*\.\s*(${IDENTIFIER_TOKEN}))?\s*$`,
  "i",
);

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

function normalizeSchema(
  candidate: string | undefined,
  fallback: string,
): string {
  const normalized = candidate?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function buildRelations(
  snapshot: DbSchemaSnapshot,
  activeSchema: string,
): SqlAutocompleteRelation[] {
  const scopedRelations: SqlAutocompleteRelation[] = [];
  const fallbackSchema = snapshot.schema?.trim() || activeSchema;

  const pushRelation = (
    relationName: string,
    columns: { name: string }[],
    kind: "table" | "view",
  ) => {
    const parsed = parseQualifiedIdentifier(relationName);
    const schema = normalizeSchema(parsed?.schema, fallbackSchema);
    const relation = parsed?.relation ?? relationName.trim();

    if (
      normalizeIdentifier(schema) !== normalizeIdentifier(activeSchema) ||
      !relation
    ) {
      return;
    }

    const uniqueColumns = new Set<string>();
    for (const column of columns) {
      const trimmed = column.name.trim();
      if (trimmed) uniqueColumns.add(trimmed);
    }

    scopedRelations.push({
      schema,
      name: relation,
      kind,
      columns: Array.from(uniqueColumns).sort((left, right) =>
        left.localeCompare(right),
      ),
    });
  };

  for (const table of snapshot.tables) {
    pushRelation(table.name, table.columns, "table");
  }
  for (const view of snapshot.views) {
    pushRelation(view.name, view.columns, "view");
  }

  return scopedRelations.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.name.localeCompare(right.name);
  });
}

export function buildAutocompleteContext(
  snapshot: DbSchemaSnapshot | null | undefined,
  activeSchema: string | undefined,
): SqlAutocompleteContext {
  const fallbackSchema =
    activeSchema?.trim() || snapshot?.schema?.trim() || "public";
  const normalizedActiveSchema = normalizeSchema(activeSchema, fallbackSchema);

  if (!snapshot) {
    return {
      activeSchema: normalizedActiveSchema,
      schemas: [normalizedActiveSchema],
      relations: [],
      columns: [],
      relationLookup: {},
    };
  }

  const relations = buildRelations(snapshot, normalizedActiveSchema);
  const relationLookup: Record<string, SqlAutocompleteRelation> = {};
  const columns: SqlAutocompleteColumn[] = [];
  const schemas = new Set<string>([normalizedActiveSchema]);

  for (const relation of relations) {
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
  };
}

export function resolveTableAlias(
  sqlText: string,
  cursorOffset: number,
): SqlAutocompleteAliasHint | null {
  const safeOffset = Math.max(0, Math.min(cursorOffset, sqlText.length));
  const sqlBeforeCursor = sqlText.slice(0, safeOffset);
  const aliasCursorMatch = sqlBeforeCursor.match(CURSOR_ALIAS_PATTERN);
  if (!aliasCursorMatch) return null;

  const aliasAtCursor = aliasCursorMatch[1];
  const aliasLookup = new Map<string, string>();
  TABLE_ALIAS_PATTERN.lastIndex = 0;

  for (
    let match = TABLE_ALIAS_PATTERN.exec(sqlBeforeCursor);
    match !== null;
    match = TABLE_ALIAS_PATTERN.exec(sqlBeforeCursor)
  ) {
    const tableReference = match[1];
    const alias = match[2];
    aliasLookup.set(normalizeIdentifier(alias), tableReference);
  }

  const matchedTable = aliasLookup.get(normalizeIdentifier(aliasAtCursor));
  if (!matchedTable) return null;

  const parsed = parseQualifiedIdentifier(matchedTable);
  if (!parsed) return null;

  return {
    alias: aliasAtCursor,
    table: parsed.relation,
    schema: parsed.schema,
  };
}

function findRelationForAlias(
  context: SqlAutocompleteContext,
  aliasHint: SqlAutocompleteAliasHint,
): SqlAutocompleteRelation | null {
  const schemaCandidate = normalizeSchema(aliasHint.schema, context.activeSchema);
  const directMatch =
    context.relationLookup[toLookupKey(schemaCandidate, aliasHint.table)];
  if (directMatch) return directMatch;

  const tableName = normalizeIdentifier(aliasHint.table);
  return (
    context.relations.find(
      (relation) => normalizeIdentifier(relation.name) === tableName,
    ) ?? null
  );
}

export function buildCompletionItems(
  context: SqlAutocompleteContext,
  aliasHint: SqlAutocompleteAliasHint | null,
): SqlCompletionItem[] {
  if (aliasHint) {
    const aliasRelation = findRelationForAlias(context, aliasHint);
    if (aliasRelation) {
      return aliasRelation.columns.map((columnName, index) => ({
        label: columnName,
        insertText: columnName,
        kind: "column",
        detail: `${aliasRelation.schema}.${aliasRelation.name}`,
        sortText: `001-${String(index).padStart(4, "0")}-${columnName.toLowerCase()}`,
      }));
    }
  }

  const items: SqlCompletionItem[] = [];
  let order = 0;

  for (const schemaName of context.schemas) {
    items.push({
      label: schemaName,
      insertText: schemaName,
      kind: "schema",
      detail: "schema",
      sortText: `100-${String(order).padStart(4, "0")}-${schemaName.toLowerCase()}`,
    });
    order += 1;
  }

  for (const relation of context.relations) {
    items.push({
      label: relation.name,
      insertText: relation.name,
      kind: relation.kind,
      detail: `${relation.kind} (${relation.schema})`,
      sortText: `200-${String(order).padStart(4, "0")}-${relation.name.toLowerCase()}`,
    });
    order += 1;
  }

  for (const column of context.columns) {
    items.push({
      label: column.name,
      insertText: column.name,
      kind: "column",
      detail: `${column.relation} (${column.schema})`,
      sortText: `300-${String(order).padStart(4, "0")}-${column.name.toLowerCase()}`,
    });
    order += 1;
  }

  return items;
}
