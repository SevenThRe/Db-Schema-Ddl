import { format } from "sql-formatter";
import type { DbDriver } from "@shared/schema";

const SQL_FORMATTER_DIALECT: Record<DbDriver, "mysql" | "postgresql"> = {
  mysql: "mysql",
  postgres: "postgresql",
};

const LEADING_JUNK_PATTERN = /^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/i;

export interface SqlEditorValidationIssue {
  severity: "error" | "warning";
  message: string;
  startOffset: number;
  endOffset: number;
}

export function stripSqlLeadingJunk(sql: string): string {
  let stripped = sql;
  let prev = "";
  while (stripped !== prev) {
    prev = stripped;
    stripped = stripped.replace(LEADING_JUNK_PATTERN, "");
  }
  return stripped;
}

export function isExplainQuery(sql: string): boolean {
  const stripped = stripSqlLeadingJunk(sql).trimStart();
  return /^explain\b/i.test(stripped);
}

export function lineColumnToOffset(
  text: string,
  lineNumber: number,
  columnNumber: number,
): number {
  const line = Math.max(1, lineNumber);
  const column = Math.max(1, columnNumber);

  let currentLine = 1;
  let offset = 0;

  while (offset < text.length && currentLine < line) {
    if (text[offset] === "\n") currentLine += 1;
    offset += 1;
  }

  return Math.min(text.length, offset + column - 1);
}

export function offsetToMarkerRange(text: string, offset: number, endOffset?: number) {
  const safeStart = Math.max(0, Math.min(offset, text.length));
  const safeEnd = Math.max(safeStart + 1, Math.min(endOffset ?? safeStart + 1, text.length));

  let line = 1;
  let column = 1;
  let endLine = 1;
  let endColumn = 1;

  for (let index = 0; index < text.length; index += 1) {
    if (index === safeStart) {
      line = endLine;
      column = endColumn;
    }
    if (index === safeEnd) {
      return {
        startLineNumber: line,
        startColumn: column,
        endLineNumber: endLine,
        endColumn,
      };
    }

    if (text[index] === "\n") {
      endLine += 1;
      endColumn = 1;
    } else {
      endColumn += 1;
    }
  }

  return {
    startLineNumber: line,
    startColumn: column,
    endLineNumber: endLine,
    endColumn,
  };
}

export function formatSqlText(sql: string, dialect: DbDriver): string {
  return format(sql, {
    language: SQL_FORMATTER_DIALECT[dialect],
    keywordCase: "upper",
  });
}

export function collectLexicalIssues(sql: string): SqlEditorValidationIssue[] {
  const issues: SqlEditorValidationIssue[] = [];
  let state: "normal" | "single" | "double" | "backtick" | "line-comment" | "block-comment" = "normal";
  let openedAt = -1;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === "normal") {
      if (current === "-" && next === "-") {
        state = "line-comment";
        index += 1;
        continue;
      }
      if (current === "/" && next === "*") {
        state = "block-comment";
        openedAt = index;
        index += 1;
        continue;
      }
      if (current === "'") {
        state = "single";
        openedAt = index;
        continue;
      }
      if (current === "\"") {
        state = "double";
        openedAt = index;
        continue;
      }
      if (current === "`") {
        state = "backtick";
        openedAt = index;
      }
      continue;
    }

    if (state === "line-comment") {
      if (current === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        state = "normal";
        openedAt = -1;
        index += 1;
      }
      continue;
    }

    const quoteChar =
      state === "single" ? "'" : state === "double" ? "\"" : "`";

    if (current !== quoteChar) continue;

    if (next === quoteChar) {
      index += 1;
      continue;
    }

    state = "normal";
    openedAt = -1;
  }

  if (state === "single") {
    issues.push({
      severity: "error",
      message: "Unterminated string literal.",
      startOffset: openedAt,
      endOffset: sql.length,
    });
  }

  if (state === "double") {
    issues.push({
      severity: "error",
      message: "Unterminated quoted identifier.",
      startOffset: openedAt,
      endOffset: sql.length,
    });
  }

  if (state === "backtick") {
    issues.push({
      severity: "error",
      message: "Unterminated backtick identifier.",
      startOffset: openedAt,
      endOffset: sql.length,
    });
  }

  if (state === "block-comment") {
    issues.push({
      severity: "error",
      message: "Unterminated block comment.",
      startOffset: openedAt,
      endOffset: sql.length,
    });
  }

  return issues;
}

export function collectFormatterIssue(
  sql: string,
  dialect: DbDriver,
): SqlEditorValidationIssue[] {
  if (!sql.trim()) return [];

  try {
    formatSqlText(sql, dialect);
    return [];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SQL parser rejected the current text.";
    const lineMatch = message.match(/line\s+(\d+)/i);
    const columnMatch = message.match(/column\s+(\d+)/i);

    if (!lineMatch || !columnMatch) {
      return [
        {
          severity: "error",
          message,
          startOffset: 0,
          endOffset: Math.max(1, sql.length),
        },
      ];
    }

    const startOffset = lineColumnToOffset(
      sql,
      Number(lineMatch[1]),
      Number(columnMatch[1]),
    );

    return [
      {
        severity: "error",
        message,
        startOffset,
        endOffset: Math.min(sql.length, startOffset + 1),
      },
    ];
  }
}
