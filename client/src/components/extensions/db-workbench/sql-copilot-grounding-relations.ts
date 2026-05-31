import type { DbSchemaSnapshot } from "@shared/schema";
import { analyzeSqlContext } from "./sql-semantic-context";
import type { SqlSemanticContext } from "./sql-semantic-types";

export type RelationKind = "table" | "view";

export type GroundingRelation = {
  key: string;
  schema: string;
  name: string;
  kind: RelationKind;
  columns: string[];
  primaryKeys: string[];
  foreignKeys: string[];
};

export function normalizeIdentifier(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function relationKey(schema: string, name: string): string {
  return `${normalizeIdentifier(schema)}.${normalizeIdentifier(name)}`;
}

function parseSchemaQualifiedName(
  candidate: string,
  fallbackSchema: string,
): { schema: string; name: string } {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return { schema: fallbackSchema, name: candidate };
  }

  const segments = trimmed.split(".");
  if (segments.length >= 2) {
    const schema = segments.at(-2)?.trim() || fallbackSchema;
    const name = segments.at(-1)?.trim() || trimmed;
    return { schema, name };
  }

  return { schema: fallbackSchema, name: trimmed };
}

export function buildGroundingRelations(
  schemaSnapshot: DbSchemaSnapshot | null | undefined,
  activeSchema: string,
): GroundingRelation[] {
  if (!schemaSnapshot) return [];

  const tables = (schemaSnapshot.tables ?? []).map((table) => {
    const parsed = parseSchemaQualifiedName(table.name, activeSchema);
    return {
      key: relationKey(parsed.schema, parsed.name),
      schema: parsed.schema,
      name: parsed.name,
      kind: "table" as const,
      columns: table.columns.map((column) => column.name.trim()).filter(Boolean),
      primaryKeys: table.columns
        .filter((column) => column.primaryKey)
        .map((column) => column.name.trim())
        .filter(Boolean),
      foreignKeys: (table.foreignKeys ?? [])
        .map((foreignKey) => {
          const referenced = parseSchemaQualifiedName(foreignKey.referencedTable, parsed.schema);
          return `${foreignKey.name}: (${foreignKey.columns.join(", ")}) -> ${referenced.schema}.${referenced.name}(${foreignKey.referencedColumns.join(", ")})`;
        })
        .filter(Boolean),
    };
  });

  const views = (schemaSnapshot.views ?? []).map((view) => {
    const parsed = parseSchemaQualifiedName(view.name, activeSchema);
    return {
      key: relationKey(parsed.schema, parsed.name),
      schema: parsed.schema,
      name: parsed.name,
      kind: "view" as const,
      columns: view.columns.map((column) => column.name.trim()).filter(Boolean),
      primaryKeys: [],
      foreignKeys: [],
    };
  });

  return [...tables, ...views];
}

export function buildSemanticContext(
  relations: GroundingRelation[],
  activeSchema: string,
): SqlSemanticContext {
  return {
    activeSchema,
    relations: relations.map((relation) => ({
      schema: relation.schema,
      name: relation.name,
      kind: relation.kind,
      columns: relation.columns,
    })),
  };
}

export function collectPreferredRelationKeys(
  relations: GroundingRelation[],
  activeSchema: string,
  selectedTableName: string | null | undefined,
  currentSql: string,
): Set<string> {
  const preferred = new Set<string>();
  const normalizedSelected = normalizeIdentifier(selectedTableName);

  if (normalizedSelected) {
    const selectedRelation = relations.find((relation) => {
      if (relation.key === normalizedSelected) return true;
      return normalizeIdentifier(relation.name) === normalizedSelected;
    });
    if (selectedRelation) {
      preferred.add(selectedRelation.key);
    }
  }

  const semanticAnalysis = analyzeSqlContext(
    buildSemanticContext(relations, activeSchema),
    currentSql,
    currentSql.length,
  );
  for (const relation of semanticAnalysis.relations) {
    preferred.add(relationKey(relation.schema, relation.name));
  }

  const sqlText = currentSql.toLowerCase();
  for (const relation of relations) {
    if (sqlText.includes(relation.name.toLowerCase())) {
      preferred.add(relation.key);
    }
  }

  return preferred;
}

export function sortRelationsForGrounding(
  relations: GroundingRelation[],
  preferredKeys: Set<string>,
  activeSchema: string,
): GroundingRelation[] {
  return [...relations].sort((left, right) => {
    const leftPreferred = preferredKeys.has(left.key) ? 1 : 0;
    const rightPreferred = preferredKeys.has(right.key) ? 1 : 0;
    if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;

    const leftActive = normalizeIdentifier(left.schema) === normalizeIdentifier(activeSchema) ? 1 : 0;
    const rightActive = normalizeIdentifier(right.schema) === normalizeIdentifier(activeSchema) ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;

    if (left.kind !== right.kind) {
      return left.kind === "table" ? -1 : 1;
    }

    return `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`);
  });
}
