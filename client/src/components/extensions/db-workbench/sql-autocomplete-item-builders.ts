import {
  DRIVER_FUNCTION_ITEMS,
  DRIVER_SYSTEM_SCHEMAS,
  DRIVER_TYPE_ITEMS,
  SQL_KEYWORD_ITEMS,
} from "./sql-autocomplete-catalog";
import type {
  SqlAutocompleteContext,
  SqlCompletionItem,
  SqlCompletionKind,
} from "./sql-autocomplete-types";
import type {
  SqlCompletionScope,
  SqlSemanticAnalysis,
  SqlSemanticRelation,
} from "./sql-semantic-types";
import { normalizeIdentifier, toLookupKey } from "./sql-lexer";

function relationToCompletionKind(relation: SqlSemanticRelation): SqlCompletionKind {
  if (relation.kind === "view" || relation.kind === "cte" || relation.kind === "subquery") {
    return "view";
  }
  return "table";
}

function isSelectedRelation(
  context: SqlAutocompleteContext,
  relationName: string,
): boolean {
  if (!context.selectedRelation) return false;
  return normalizeIdentifier(context.selectedRelation) === normalizeIdentifier(relationName);
}

export function buildKeywordItems(scope: SqlCompletionScope): SqlCompletionItem[] {
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
      acceptedSuggestion:
        item.kind === "template"
          ? {
              label: item.label,
              kind: item.kind,
            }
          : undefined,
    };
  });
}

export function buildFunctionItems(
  context: SqlAutocompleteContext,
  scope: SqlCompletionScope,
): SqlCompletionItem[] {
  if (scope === "relation") return [];

  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < DRIVER_FUNCTION_ITEMS[context.driver].length; index += 1) {
    const builtin = DRIVER_FUNCTION_ITEMS[context.driver][index]!;
    const key = normalizeIdentifier(builtin.label);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      label: builtin.label,
      insertText: builtin.insertText,
      kind: "function",
      detail: builtin.detail,
      sortText: `${scope === "column" ? "100" : "090"}-${String(index).padStart(4, "0")}-${builtin.label.toLowerCase()}`,
      insertAsSnippet: builtin.insertAsSnippet,
      acceptedSuggestion: {
        label: builtin.label,
        kind: "function",
      },
    });
  }

  for (let index = 0; index < context.routines.length; index += 1) {
    const routine = context.routines[index]!;
    const key = normalizeIdentifier(routine.name);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
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
      schema: routine.schema,
      acceptedSuggestion: {
        label: routine.name,
        kind: "function",
        schema: routine.schema,
      },
    });
  }

  return items;
}

export function buildTypeItems(
  context: SqlAutocompleteContext,
  scope: SqlCompletionScope,
): SqlCompletionItem[] {
  if (scope === "relation") return [];

  return DRIVER_TYPE_ITEMS[context.driver].map((item, index) => ({
    label: item.label,
    insertText: item.insertText,
    kind: "type",
    detail: item.detail,
    sortText: `${scope === "column" ? "130" : "125"}-${String(index).padStart(4, "0")}-${item.label.toLowerCase()}`,
    acceptedSuggestion: {
      label: item.label,
      kind: "type",
    },
  }));
}

export function buildRelationItems(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
): SqlCompletionItem[] {
  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();
  const visibleRelationKeys = new Set(
    analysis.bindings.map((binding) =>
      toLookupKey(binding.relation.schema, binding.relation.name),
    ),
  );
  let order = 0;

  const allRelations = [...analysis.relations].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.name.localeCompare(right.name);
  });

  for (const relation of allRelations) {
    const key = toLookupKey(relation.schema, relation.name);
    if (seen.has(key)) continue;
    seen.add(key);

    const relationPrefix =
      analysis.scope === "relation"
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
      schema: relation.schema,
      relation: relation.name,
      acceptedSuggestion: {
        label: relation.name,
        kind: relationToCompletionKind(relation),
        schema: relation.schema,
        relation: relation.name,
      },
    });
    order += 1;
  }

  return items;
}

export function buildSchemaItems(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
): SqlCompletionItem[] {
  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...context.schemas,
    ...DRIVER_SYSTEM_SCHEMAS[context.driver],
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const schemaName = candidates[index]!;
    const normalized = normalizeIdentifier(schemaName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const isSystem = DRIVER_SYSTEM_SCHEMAS[context.driver].some(
      (value) => normalizeIdentifier(value) === normalized,
    );
    const isActive = normalized === normalizeIdentifier(context.activeSchema);
    const prefix =
      analysis.scope === "relation"
        ? isActive
          ? "230"
          : isSystem
            ? "245"
            : "240"
        : isActive
          ? "390"
          : isSystem
            ? "405"
            : "400";

    items.push({
      label: schemaName,
      insertText: schemaName,
      kind: "schema",
      detail: isSystem ? `system schema (${context.driver})` : "schema",
      sortText: `${prefix}-${String(index).padStart(4, "0")}-${schemaName.toLowerCase()}`,
      schema: schemaName,
      acceptedSuggestion: {
        label: schemaName,
        kind: "schema",
        schema: schemaName,
      },
    });
  }

  return items;
}

export function buildColumnItems(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
): SqlCompletionItem[] {
  const items: SqlCompletionItem[] = [];
  const preferredBindings = analysis.bindings;
  const preferredLookup = new Set(
    preferredBindings.map((binding) =>
      toLookupKey(binding.relation.schema, binding.relation.name),
    ),
  );
  const seen = new Set<string>();
  let order = 0;

  const appendColumn = (
    relation: SqlSemanticRelation,
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
      schema: relation.schema,
      relation: relation.name,
      column: columnName,
      acceptedSuggestion: {
        label: columnName,
        kind: "column",
        schema: relation.schema,
        relation: relation.name,
        column: columnName,
      },
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
