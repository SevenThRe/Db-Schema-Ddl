import {
  buildSqlMemorySuggestionKey,
  toSqlMemoryColumnKey,
  toSqlMemoryRelationKey,
} from "./sql-memory";
import type { SqlSemanticAnalysis } from "./sql-semantic-types";
import type {
  SqlAutocompleteContext,
  SqlCompletionItem,
} from "./sql-autocomplete-types";
import { normalizeIdentifier } from "./sql-lexer";

function extractSortBucket(sortText: string): number {
  const match = sortText.match(/^(\d{3})-/);
  return match ? Number(match[1]) : 999;
}

function getAcceptedSuggestionCount(
  context: SqlAutocompleteContext,
  item: SqlCompletionItem,
): number {
  if (!item.acceptedSuggestion) return 0;
  const key = buildSqlMemorySuggestionKey(item.acceptedSuggestion);
  return (
    context.sqlMemory.acceptedSuggestions.find((entry) => entry.key === key)?.count ?? 0
  );
}

function getRelationPatternCount(
  context: SqlAutocompleteContext,
  schema: string | null | undefined,
  relation: string | null | undefined,
): number {
  if (!schema || !relation) return 0;
  const relationKey = toSqlMemoryRelationKey(schema, relation);
  return context.sqlMemory.queryPatterns.reduce(
    (sum, entry) => sum + (entry.relationKeys.includes(relationKey) ? entry.count : 0),
    0,
  );
}

function getColumnPatternCount(
  context: SqlAutocompleteContext,
  schema: string | null | undefined,
  relation: string | null | undefined,
  column: string | null | undefined,
): number {
  if (!schema || !relation || !column) return 0;
  const columnKey = toSqlMemoryColumnKey(schema, relation, column);
  return context.sqlMemory.queryPatterns.reduce(
    (sum, entry) => sum + (entry.columnKeys.includes(columnKey) ? entry.count : 0),
    0,
  );
}

function findValueProfile(
  context: SqlAutocompleteContext,
  schema: string | null | undefined,
  relation: string | null | undefined,
  column: string | null | undefined,
) {
  if (!schema || !relation || !column) return null;
  const key = toSqlMemoryColumnKey(schema, relation, column);
  return context.sqlMemory.valueProfiles.find((entry) => entry.key === key) ?? null;
}

export function getAdaptiveCompletionScore(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
  item: SqlCompletionItem,
): number {
  let score = 0;

  const acceptedCount = getAcceptedSuggestionCount(context, item);
  if (acceptedCount > 0) {
    score += Math.min(18, acceptedCount * 4);
  }

  if (item.schema && item.relation) {
    const relationPatternCount = getRelationPatternCount(context, item.schema, item.relation);
    if (relationPatternCount > 0) {
      score += Math.min(14, relationPatternCount * 2);
    }
  }

  if (item.schema && item.relation && item.column) {
    const columnPatternCount = getColumnPatternCount(
      context,
      item.schema,
      item.relation,
      item.column,
    );
    if (columnPatternCount > 0) {
      score += Math.min(16, columnPatternCount * 3);
    }

    if (
      analysis.clause === "where" ||
      analysis.clause === "having" ||
      analysis.clause === "group-by" ||
      analysis.clause === "order-by" ||
      analysis.clause === "select"
    ) {
      const valueProfile = findValueProfile(context, item.schema, item.relation, item.column);
      if (valueProfile) {
        score += Math.min(10, 2 + Math.floor(valueProfile.sampleCount / 8));
      }
    }
  }

  const schemaItemName = item.kind === "schema" ? item.schema : null;
  if (schemaItemName) {
    const schemaPatternCount = context.sqlMemory.queryPatterns.reduce((sum, entry) => {
      return (
        sum +
        (normalizeIdentifier(entry.schema ?? "") === normalizeIdentifier(schemaItemName)
          ? entry.count
          : 0)
      );
    }, 0);
    if (schemaPatternCount > 0) {
      score += Math.min(10, schemaPatternCount * 2);
    }
  }

  return score;
}

export function sortCompletionItemsWithMemory(
  context: SqlAutocompleteContext,
  analysis: SqlSemanticAnalysis,
  items: SqlCompletionItem[],
): SqlCompletionItem[] {
  const scoreCache = new Map<string, number>();

  const getScore = (item: SqlCompletionItem): number => {
    const identity = [
      item.sortText,
      item.kind,
      item.schema ?? "",
      item.relation ?? "",
      item.column ?? "",
      item.label,
    ].join("::");
    const cached = scoreCache.get(identity);
    if (typeof cached === "number") return cached;
    const computed = getAdaptiveCompletionScore(context, analysis, item);
    scoreCache.set(identity, computed);
    return computed;
  };

  return [...items].sort((left, right) => {
    const leftBucket = Math.max(0, extractSortBucket(left.sortText) - Math.min(24, getScore(left)));
    const rightBucket = Math.max(0, extractSortBucket(right.sortText) - Math.min(24, getScore(right)));
    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket;
    }

    const scoreDelta = getScore(right) - getScore(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.sortText.localeCompare(right.sortText);
  });
}
