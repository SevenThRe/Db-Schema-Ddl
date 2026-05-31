import type {
  SqlAutocompleteContext,
  SqlAutocompleteRelation,
  SqlCompletionItem,
} from "./sql-autocomplete-types";
import type {
  SqlSemanticAnalysis,
  SqlSemanticBinding,
} from "./sql-semantic-types";
import { normalizeIdentifier, toLookupKey } from "./sql-lexer";

function suggestRelationAlias(
  relationName: string,
  bindings: SqlSemanticBinding[],
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

export function buildJoinTemplateItems(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
): SqlCompletionItem[] {
  if (
    analysis.scope !== "relation" ||
    analysis.clause !== "join" ||
    analysis.bindings.length === 0
  ) {
    return [];
  }

  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();
  const boundRelationKeys = new Set(
    analysis.bindings.map((binding) =>
      toLookupKey(binding.relation.schema, binding.relation.name),
    ),
  );

  const pushJoinItem = (
    relation: SqlAutocompleteRelation,
    insertText: string,
    detail: string,
    columns?: string[],
  ) => {
    if (seen.has(insertText)) return;
    seen.add(insertText);
    items.push({
      label: `JOIN ${relation.name} via FK`,
      insertText,
      kind: "template",
      detail,
      sortText: `140-${String(items.length).padStart(4, "0")}-${relation.name.toLowerCase()}`,
      schema: relation.schema,
      relation: relation.name,
      column: columns?.[0] ?? null,
      acceptedSuggestion: {
        label: `JOIN ${relation.name} via FK`,
        kind: "template",
        schema: relation.schema,
        relation: relation.name,
        column: columns?.[0] ?? null,
      },
    });
  };

  for (let bindingIndex = analysis.bindings.length - 1; bindingIndex >= 0; bindingIndex -= 1) {
    const binding = analysis.bindings[bindingIndex]!;
    const bindingKey = toLookupKey(binding.relation.schema, binding.relation.name);

    for (const edge of context.joinEdges) {
      const sourceKey = toLookupKey(edge.sourceSchema, edge.sourceRelation);
      const targetKey = toLookupKey(edge.targetSchema, edge.targetRelation);

      if (bindingKey === sourceKey && !boundRelationKeys.has(targetKey)) {
        const target = context.relationLookup[targetKey];
        if (!target) continue;
        const alias = suggestRelationAlias(target.name, analysis.bindings);
        pushJoinItem(
          target,
          `${target.name} ${alias} ON ${buildJoinCondition(
            binding.alias,
            edge.sourceColumns,
            alias,
            edge.targetColumns,
          )}`,
          `${edge.foreignKeyName}: ${binding.relation.name} -> ${target.name}`,
          edge.targetColumns,
        );
      }

      if (bindingKey === targetKey && !boundRelationKeys.has(sourceKey)) {
        const source = context.relationLookup[sourceKey];
        if (!source) continue;
        const alias = suggestRelationAlias(source.name, analysis.bindings);
        pushJoinItem(
          source,
          `${source.name} ${alias} ON ${buildJoinCondition(
            alias,
            edge.sourceColumns,
            binding.alias,
            edge.targetColumns,
          )}`,
          `${edge.foreignKeyName}: ${source.name} -> ${binding.relation.name}`,
          edge.sourceColumns,
        );
      }
    }
  }

  return items;
}

export function buildJoinConditionItems(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
): SqlCompletionItem[] {
  if (analysis.clause !== "on" || analysis.allBindings.length < 2) {
    return [];
  }

  const items: SqlCompletionItem[] = [];
  const seen = new Set<string>();
  const currentBinding = analysis.allBindings[analysis.allBindings.length - 1]!;
  const priorBindings = analysis.allBindings.slice(0, -1);
  const currentKey = toLookupKey(
    currentBinding.relation.schema,
    currentBinding.relation.name,
  );

  const pushCondition = (insertText: string, detail: string) => {
    if (seen.has(insertText)) return;
    seen.add(insertText);
    items.push({
      label: insertText,
      insertText,
      kind: "template",
      detail,
      sortText: `135-${String(items.length).padStart(4, "0")}-${insertText.toLowerCase()}`,
      acceptedSuggestion: {
        label: insertText,
        kind: "template",
      },
    });
  };

  for (const priorBinding of priorBindings) {
    const priorKey = toLookupKey(priorBinding.relation.schema, priorBinding.relation.name);
    for (const edge of context.joinEdges) {
      const sourceKey = toLookupKey(edge.sourceSchema, edge.sourceRelation);
      const targetKey = toLookupKey(edge.targetSchema, edge.targetRelation);

      if (currentKey === sourceKey && priorKey === targetKey) {
        pushCondition(
          buildJoinCondition(
            currentBinding.alias,
            edge.sourceColumns,
            priorBinding.alias,
            edge.targetColumns,
          ),
          `${edge.foreignKeyName}: ${currentBinding.relation.name} -> ${priorBinding.relation.name}`,
        );
      }

      if (currentKey === targetKey && priorKey === sourceKey) {
        pushCondition(
          buildJoinCondition(
            priorBinding.alias,
            edge.sourceColumns,
            currentBinding.alias,
            edge.targetColumns,
          ),
          `${edge.foreignKeyName}: ${priorBinding.relation.name} -> ${currentBinding.relation.name}`,
        );
      }
    }
  }

  return items;
}
