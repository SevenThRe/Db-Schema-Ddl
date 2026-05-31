import { analyzeSqlContext } from "./sql-semantic-context";
import type {
  SqlAutocompleteAliasHint,
  SqlAutocompleteContext,
  SqlCompletionItem,
} from "./sql-autocomplete-types";
import {
  resolveAutocompleteAliasRelation,
  resolveTableAlias,
} from "./sql-autocomplete-alias-resolution";
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
import { sortCompletionItemsWithMemory } from "./sql-autocomplete-memory-ranking";

export { resolveSemanticHoverSymbol } from "./sql-semantic-context";
export { buildAutocompleteContext } from "./sql-autocomplete-context";
export { resolveTableAlias } from "./sql-autocomplete-alias-resolution";
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
          const relation = resolveAutocompleteAliasRelation(context, aliasHint);
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
