import {
  findMatchingParen,
  normalizeIdentifier,
  previousToken,
  stripIdentifierQuotes,
  tokenizeSql,
  type SqlToken,
} from "./sql-lexer";
import {
  consumeRelationReference,
  readAliasToken,
  resolveRelation,
} from "./sql-semantic-relation-analysis";
import {
  analyzeSqlContext,
  resolveStatementRanges,
} from "./sql-semantic-statement-analysis";
import type {
  SqlSemanticAnalysis,
  SqlSemanticContext,
  SqlSemanticDiagnostic,
} from "./sql-semantic-types";

function makeDiagnostic(
  diagnostic: Omit<SqlSemanticDiagnostic, "startOffset" | "endOffset">,
  statementOffset: number,
  startOffset: number,
  endOffset: number,
): SqlSemanticDiagnostic {
  return {
    ...diagnostic,
    startOffset: statementOffset + startOffset,
    endOffset: statementOffset + endOffset,
  };
}

function isClauseBoundaryToken(token: SqlToken | undefined): boolean {
  if (!token || token.depth !== 0 || token.kind !== "identifier") return false;
  return [
    "JOIN",
    "WHERE",
    "GROUP",
    "ORDER",
    "HAVING",
    "RETURNING",
    "LIMIT",
    "OFFSET",
    "SET",
    "VALUES",
    "UNION",
    "EXCEPT",
    "INTERSECT",
  ].includes(token.normalized);
}

function collectStatementDiagnostics(
  context: SqlSemanticContext,
  analysis: SqlSemanticAnalysis,
): SqlSemanticDiagnostic[] {
  const diagnostics: SqlSemanticDiagnostic[] = [];
  const seen = new Set<string>();
  const tokens = tokenizeSql(analysis.statementSql);

  const pushDiagnostic = (diagnostic: SqlSemanticDiagnostic) => {
    const key = [
      diagnostic.code,
      diagnostic.startOffset,
      diagnostic.endOffset,
      diagnostic.message,
    ].join("::");
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
  };

  const aliasSeen = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.depth !== 0 || token.kind !== "identifier") continue;

    if (
      token.normalized === "FROM" ||
      token.normalized === "JOIN" ||
      token.normalized === "UPDATE" ||
      token.normalized === "INTO"
    ) {
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
        if (aliasToken) {
          const normalizedAlias = normalizeIdentifier(aliasToken.text);
          if (aliasSeen.has(normalizedAlias)) {
            pushDiagnostic(
              makeDiagnostic(
                {
                  code: "duplicate_alias",
                  severity: "warning",
                  message: `Alias \`${stripIdentifierQuotes(aliasToken.text)}\` is reused in the current statement.`,
                },
                analysis.statementOffset,
                aliasToken.start,
                aliasToken.end,
              ),
            );
          } else {
            aliasSeen.add(normalizedAlias);
          }
        }
        index = closeIndex;
        continue;
      }

      const relationRef = consumeRelationReference(tokens, cursor);
      if (!relationRef) continue;
      const relation = resolveRelation(
        analysis.relations,
        relationRef.schema,
        relationRef.relation,
        context.activeSchema,
      );
      if (!relation) {
        const start = tokens[cursor]!.start;
        const end = tokens[relationRef.nextIndex - 1]!.end;
        pushDiagnostic(
          makeDiagnostic(
            {
              code: "unknown_relation",
              severity: "error",
              message: `Unknown relation \`${relationRef.relation}\` in the current schema scope.`,
            },
            analysis.statementOffset,
            start,
            end,
          ),
        );
      }

      const aliasToken = readAliasToken(tokens, relationRef.nextIndex);
      if (aliasToken) {
        const normalizedAlias = normalizeIdentifier(aliasToken.text);
        if (aliasSeen.has(normalizedAlias)) {
          pushDiagnostic(
            makeDiagnostic(
              {
                code: "duplicate_alias",
                severity: "warning",
                message: `Alias \`${stripIdentifierQuotes(aliasToken.text)}\` is reused in the current statement.`,
              },
              analysis.statementOffset,
              aliasToken.start,
              aliasToken.end,
            ),
          );
        } else {
          aliasSeen.add(normalizedAlias);
        }
      } else if (relation) {
        aliasSeen.add(normalizeIdentifier(relation.name));
      }

      if (token.normalized === "JOIN") {
        const previous = previousToken(tokens, index);
        const requiresCondition =
          previous?.normalized !== "CROSS" && previous?.normalized !== "NATURAL";
        if (requiresCondition) {
          let hasJoinCondition = false;
          for (let lookahead = relationRef.nextIndex; lookahead < tokens.length; lookahead += 1) {
            const candidate = tokens[lookahead];
            if (!candidate || candidate.depth !== 0) continue;
            if (candidate.normalized === "ON" || candidate.normalized === "USING") {
              hasJoinCondition = true;
              break;
            }
            if (isClauseBoundaryToken(candidate)) break;
          }
          if (!hasJoinCondition) {
            pushDiagnostic(
              makeDiagnostic(
                {
                  code: "missing_join_condition",
                  severity: "warning",
                  message: "JOIN clause does not include ON or USING.",
                },
                analysis.statementOffset,
                token.start,
                tokens[relationRef.nextIndex - 1]!.end,
              ),
            );
          }
        }
      }

      index = relationRef.nextIndex - 1;
    }
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const qualifier = tokens[index];
    const dot = tokens[index + 1];
    const column = tokens[index + 2];
    if (
      qualifier?.kind !== "identifier" ||
      dot?.text !== "." ||
      column?.kind !== "identifier"
    ) {
      continue;
    }

    const binding =
      analysis.allBindings.find(
        (candidate) =>
          normalizeIdentifier(candidate.alias) === normalizeIdentifier(qualifier.text),
      ) ?? null;

    if (!binding) {
      pushDiagnostic(
        makeDiagnostic(
          {
            code: "unknown_qualifier",
            severity: "error",
            message: `Unknown alias or qualifier \`${stripIdentifierQuotes(qualifier.text)}\`.`,
          },
          analysis.statementOffset,
          qualifier.start,
          qualifier.end,
        ),
      );
      continue;
    }

    if (
      !binding.relation.columns.some(
        (candidate) => normalizeIdentifier(candidate) === normalizeIdentifier(column.text),
      )
    ) {
      pushDiagnostic(
        makeDiagnostic(
          {
            code: "unknown_column",
            severity: "error",
            message: `Column \`${stripIdentifierQuotes(column.text)}\` does not exist on \`${binding.alias}\`.`,
          },
          analysis.statementOffset,
          column.start,
          column.end,
        ),
      );
    }
  }

  const statementStart = analysis.statement.clauses[0]?.startOffset ?? 0;
  const hasWhere = analysis.statement.clauses.some((clause) => clause.clause === "where");
  if (analysis.statement.kind === "update" && !hasWhere) {
    pushDiagnostic(
      makeDiagnostic(
        {
          code: "update_without_where",
          severity: "warning",
          message: "UPDATE statement has no WHERE clause.",
        },
        analysis.statementOffset,
        statementStart,
        Math.min(analysis.statementSql.length, statementStart + 6),
      ),
    );
  }

  if (analysis.statement.kind === "delete" && !hasWhere) {
    pushDiagnostic(
      makeDiagnostic(
        {
          code: "delete_without_where",
          severity: "warning",
          message: "DELETE statement has no WHERE clause.",
        },
        analysis.statementOffset,
        statementStart,
        Math.min(analysis.statementSql.length, statementStart + 6),
      ),
    );
  }

  return diagnostics;
}

export function collectSemanticDiagnostics(
  context: SqlSemanticContext,
  sqlText: string,
): SqlSemanticDiagnostic[] {
  const diagnostics: SqlSemanticDiagnostic[] = [];
  for (const range of resolveStatementRanges(sqlText)) {
    const analysis = analyzeSqlContext(context, sqlText, range.endOffset);
    diagnostics.push(...collectStatementDiagnostics(context, analysis));
  }
  return diagnostics;
}
