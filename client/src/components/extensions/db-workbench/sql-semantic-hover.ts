import {
  nextToken,
  normalizeIdentifier,
  previousToken,
  stripIdentifierQuotes,
  tokenizeSql,
  type SqlToken,
} from "./sql-lexer";
import { resolveRelation } from "./sql-semantic-relation-analysis";
import { analyzeSqlContext } from "./sql-semantic-statement-analysis";
import type {
  SqlSemanticContext,
  SqlSemanticHoverSymbol,
  SqlSemanticRelation,
} from "./sql-semantic-types";

function findTokenIndexAtOffset(tokens: SqlToken[], offset: number): number {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (offset >= token.start && offset <= token.end) return index;
    if (offset < token.start) return Math.max(0, index - 1);
  }
  return tokens.length - 1;
}

function describeRelation(
  relation: SqlSemanticRelation,
  alias?: string,
): SqlSemanticHoverSymbol {
  const previewColumns = relation.columns.slice(0, 6);
  const hiddenColumnCount = Math.max(0, relation.columns.length - previewColumns.length);

  return {
    kind: "relation",
    label: alias ? `${alias} -> ${relation.name}` : relation.name,
    detail: `${relation.kind} (${relation.schema})`,
    documentation: [
      alias ? `Alias: ${alias}` : `Relation: ${relation.schema}.${relation.name}`,
      previewColumns.length > 0
        ? `Columns: ${previewColumns.join(", ")}${hiddenColumnCount > 0 ? ` +${hiddenColumnCount} more` : ""}`
        : "Columns: unknown",
    ],
    startOffset: 0,
    endOffset: 0,
  };
}

export function resolveSemanticHoverSymbol(
  context: SqlSemanticContext,
  sqlText: string,
  cursorOffset: number,
): SqlSemanticHoverSymbol | null {
  const analysis = analyzeSqlContext(context, sqlText, cursorOffset);
  const tokens = tokenizeSql(analysis.statementSql);
  if (tokens.length === 0) return null;

  const tokenIndex = findTokenIndexAtOffset(tokens, analysis.cursorOffsetInStatement);
  const token = tokens[tokenIndex];
  if (!token || token.kind !== "identifier") return null;

  const setRange = (
    symbol: SqlSemanticHoverSymbol,
    start: number,
    end: number,
  ): SqlSemanticHoverSymbol => ({
    ...symbol,
    startOffset: analysis.statementOffset + start,
    endOffset: analysis.statementOffset + end,
  });

  const previous = previousToken(tokens, tokenIndex);
  const previousPrevious = previous ? previousToken(tokens, tokenIndex - 1) : undefined;
  const next = nextToken(tokens, tokenIndex);
  const nextNext = next ? nextToken(tokens, tokenIndex + 1) : undefined;

  if (previous?.text === "." && previousPrevious?.kind === "identifier") {
    const qualifier = stripIdentifierQuotes(previousPrevious.text);
    const binding =
      analysis.allBindings.find(
        (candidate) =>
          normalizeIdentifier(candidate.alias) === normalizeIdentifier(qualifier),
      ) ?? null;
    if (binding) {
      return setRange(
        {
          kind: "column",
          label: stripIdentifierQuotes(token.text),
          detail: `column from ${binding.relation.name} (${binding.relation.kind})`,
          documentation: [
            `Qualifier: ${qualifier}`,
            `Schema: ${binding.relation.schema}`,
          ],
          startOffset: 0,
          endOffset: 0,
        },
        token.start,
        token.end,
      );
    }
  }

  if (next?.text === "." && nextNext?.kind === "identifier") {
    const alias = stripIdentifierQuotes(token.text);
    const binding =
      analysis.allBindings.find(
        (candidate) =>
          normalizeIdentifier(candidate.alias) === normalizeIdentifier(alias),
      ) ?? null;
    if (binding) {
      return setRange(describeRelation(binding.relation, alias), token.start, token.end);
    }
  }

  const aliasBinding =
    analysis.allBindings.find(
      (candidate) =>
        normalizeIdentifier(candidate.alias) === normalizeIdentifier(token.text),
    ) ?? null;
  if (aliasBinding) {
    return setRange(
      describeRelation(aliasBinding.relation, aliasBinding.alias),
      token.start,
      token.end,
    );
  }

  const relation = resolveRelation(
    analysis.relations,
    undefined,
    stripIdentifierQuotes(token.text),
    context.activeSchema,
  );
  if (relation) {
    return setRange(describeRelation(relation), token.start, token.end);
  }

  return null;
}
