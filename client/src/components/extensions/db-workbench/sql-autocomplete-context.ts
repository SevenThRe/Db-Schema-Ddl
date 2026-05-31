import type {
  DbDriver,
  DbSchemaSnapshot,
  DbTableSchema,
} from "@shared/schema";
import { createEmptySqlWorkbenchMemory, type SqlWorkbenchMemoryState } from "./sql-memory";
import {
  normalizeIdentifier,
  normalizeSchema,
  parseQualifiedIdentifier,
  toLookupKey,
} from "./sql-lexer";
import type {
  SqlAutocompleteColumn,
  SqlAutocompleteContext,
  SqlAutocompleteJoinEdge,
  SqlAutocompleteRelation,
  SqlAutocompleteRoutine,
} from "./sql-autocomplete-types";

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

export function buildAutocompleteContext(
  snapshot: DbSchemaSnapshot | null | undefined,
  activeSchema: string | undefined,
  selectedRelationName?: string | null,
  driver: DbDriver = "postgres",
  sqlMemory: SqlWorkbenchMemoryState = createEmptySqlWorkbenchMemory(),
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
      driver,
      activeSchema: normalizedActiveSchema,
      schemas: [normalizedActiveSchema],
      relations: [],
      columns: [],
      relationLookup: {},
      selectedRelation,
      routines: [],
      joinEdges: [],
      sqlMemory,
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
    driver,
    activeSchema: normalizedActiveSchema,
    schemas: Array.from(schemas).sort((left, right) => left.localeCompare(right)),
    relations,
    columns,
    relationLookup,
    selectedRelation,
    routines: buildRoutines(snapshot, normalizedActiveSchema),
    joinEdges: buildJoinEdges(snapshot, relationLookup, normalizedActiveSchema),
    sqlMemory,
  };
}
