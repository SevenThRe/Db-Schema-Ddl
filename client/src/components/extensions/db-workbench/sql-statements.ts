export type SqlStatementKind =
  | "select"
  | "dml"
  | "ddl"
  | "show"
  | "explain"
  | "other";

export interface SqlStatementSegment {
  index: number;
  sql: string;
  start: number;
  end: number;
  kind: SqlStatementKind;
  summary: string;
}

type ParseState =
  | "normal"
  | "single"
  | "double"
  | "backtick"
  | "line-comment"
  | "block-comment";

function trimStatementBounds(sql: string, start: number, end: number): [number, number] | null {
  if (start >= end || end > sql.length) return null;
  let nextStart = start;
  let nextEnd = end;

  while (nextStart < nextEnd && /\s/.test(sql[nextStart] ?? "")) {
    nextStart += 1;
  }
  while (nextEnd > nextStart && /\s/.test(sql[nextEnd - 1] ?? "")) {
    nextEnd -= 1;
  }

  if (nextStart >= nextEnd) return null;
  return [nextStart, nextEnd];
}

function classifySqlStatement(sql: string): SqlStatementKind {
  const normalized = stripLeadingComments(sql).toUpperCase();
  if (
    normalized.startsWith("SELECT") ||
    normalized.startsWith("WITH") ||
    normalized.startsWith("TABLE")
  ) {
    return "select";
  }
  if (normalized.startsWith("SHOW") || normalized.startsWith("DESC ") || normalized.startsWith("DESCRIBE ")) {
    return "show";
  }
  if (normalized.startsWith("EXPLAIN")) {
    return "explain";
  }
  if (
    normalized.startsWith("INSERT") ||
    normalized.startsWith("UPDATE") ||
    normalized.startsWith("DELETE") ||
    normalized.startsWith("MERGE")
  ) {
    return "dml";
  }
  if (
    normalized.startsWith("CREATE") ||
    normalized.startsWith("ALTER") ||
    normalized.startsWith("DROP") ||
    normalized.startsWith("TRUNCATE")
  ) {
    return "ddl";
  }
  return "other";
}

function stripLeadingComments(sql: string): string {
  let value = sql.trimStart();

  while (value.startsWith("--") || value.startsWith("/*")) {
    if (value.startsWith("--")) {
      const newlineIndex = value.indexOf("\n");
      value = newlineIndex >= 0 ? value.slice(newlineIndex + 1).trimStart() : "";
      continue;
    }
    if (value.startsWith("/*")) {
      const endIndex = value.indexOf("*/");
      value = endIndex >= 0 ? value.slice(endIndex + 2).trimStart() : "";
    }
  }

  return value;
}

function summarizeSql(sql: string, limit = 96): string {
  const collapsed = stripLeadingComments(sql).replace(/\s+/g, " ").trim();
  if (!collapsed) return "(empty statement)";
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function splitSqlStatements(sql: string): SqlStatementSegment[] {
  const segments: SqlStatementSegment[] = [];
  let state: ParseState = "normal";
  let segmentStart = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (current === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        state = "normal";
        index += 1;
      }
      continue;
    }
    if (state === "single") {
      if (current === "'" && next === "'") {
        index += 1;
        continue;
      }
      if (current === "'") state = "normal";
      continue;
    }
    if (state === "double") {
      if (current === "\"" && next === "\"") {
        index += 1;
        continue;
      }
      if (current === "\"") state = "normal";
      continue;
    }
    if (state === "backtick") {
      if (current === "`" && next === "`") {
        index += 1;
        continue;
      }
      if (current === "`") state = "normal";
      continue;
    }

    if (current === "-" && next === "-") {
      state = "line-comment";
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      continue;
    }
    if (current === "'") {
      state = "single";
      continue;
    }
    if (current === "\"") {
      state = "double";
      continue;
    }
    if (current === "`") {
      state = "backtick";
      continue;
    }

    if (current === ";") {
      const bounds = trimStatementBounds(sql, segmentStart, index);
      if (bounds) {
        const [start, end] = bounds;
        const statementSql = sql.slice(start, end);
        segments.push({
          index: segments.length,
          sql: statementSql,
          start,
          end,
          kind: classifySqlStatement(statementSql),
          summary: summarizeSql(statementSql),
        });
      }
      segmentStart = index + 1;
    }
  }

  const finalBounds = trimStatementBounds(sql, segmentStart, sql.length);
  if (finalBounds) {
    const [start, end] = finalBounds;
    const statementSql = sql.slice(start, end);
    segments.push({
      index: segments.length,
      sql: statementSql,
      start,
      end,
      kind: classifySqlStatement(statementSql),
      summary: summarizeSql(statementSql),
    });
  }

  return segments;
}
