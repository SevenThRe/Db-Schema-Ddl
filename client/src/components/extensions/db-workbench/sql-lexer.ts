export type SqlTokenKind = "identifier" | "punctuation" | "number";

export interface SqlToken {
  text: string;
  normalized: string;
  start: number;
  end: number;
  depth: number;
  kind: SqlTokenKind;
}

export const SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE =
  String.raw`(?:"[^"]+"|` + "`[^`]+`" + String.raw`|[A-Za-z_][\w$]*)`;

const QUALIFIED_IDENTIFIER_PATTERN = new RegExp(
  String.raw`^\s*(${SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE})(?:\s*\.\s*(${SQL_IDENTIFIER_TOKEN_PATTERN_SOURCE}))?\s*$`,
  "i",
);

export function stripIdentifierQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "`" && last === "`")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function normalizeIdentifier(value: string): string {
  return stripIdentifierQuotes(value).trim().toLowerCase();
}

export function normalizeSchema(candidate: string | undefined, fallback: string): string {
  const normalized = candidate?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function toLookupKey(schema: string, relation: string): string {
  return `${normalizeIdentifier(schema)}.${normalizeIdentifier(relation)}`;
}

export function parseQualifiedIdentifier(
  value: string,
): { schema?: string; relation: string } | null {
  const match = value.match(QUALIFIED_IDENTIFIER_PATTERN);
  if (!match) return null;

  if (match[2]) {
    return {
      schema: stripIdentifierQuotes(match[1]),
      relation: stripIdentifierQuotes(match[2]),
    };
  }

  return {
    relation: stripIdentifierQuotes(match[1]),
  };
}

export function tokenizeSql(sqlText: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  let depth = 0;

  while (index < sqlText.length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === "-" && next === "-") {
      index += 2;
      while (index < sqlText.length && sqlText[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < sqlText.length - 1) {
        if (sqlText[index] === "*" && sqlText[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (current === "'") {
      index += 1;
      while (index < sqlText.length) {
        if (sqlText[index] === "'") {
          if (sqlText[index + 1] === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (current === '"') {
      const start = index;
      index += 1;
      while (index < sqlText.length) {
        if (sqlText[index] === '"') {
          if (sqlText[index + 1] === '"') {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: normalizeIdentifier(text).toUpperCase(),
        start,
        end: index,
        depth,
        kind: "identifier",
      });
      continue;
    }

    if (current === "`") {
      const start = index;
      index += 1;
      while (index < sqlText.length && sqlText[index] !== "`") {
        index += 1;
      }
      if (index < sqlText.length) index += 1;
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: normalizeIdentifier(text).toUpperCase(),
        start,
        end: index,
        depth,
        kind: "identifier",
      });
      continue;
    }

    if (current === "(") {
      tokens.push({
        text: current,
        normalized: current,
        start: index,
        end: index + 1,
        depth,
        kind: "punctuation",
      });
      depth += 1;
      index += 1;
      continue;
    }

    if (current === ")") {
      depth = Math.max(0, depth - 1);
      tokens.push({
        text: current,
        normalized: current,
        start: index,
        end: index + 1,
        depth,
        kind: "punctuation",
      });
      index += 1;
      continue;
    }

    if (current === "," || current === "." || current === ";") {
      tokens.push({
        text: current,
        normalized: current,
        start: index,
        end: index + 1,
        depth,
        kind: "punctuation",
      });
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(current)) {
      const start = index;
      index += 1;
      while (index < sqlText.length && /[A-Za-z0-9_$]/.test(sqlText[index])) {
        index += 1;
      }
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: text.toUpperCase(),
        start,
        end: index,
        depth,
        kind: "identifier",
      });
      continue;
    }

    if (/[0-9]/.test(current)) {
      const start = index;
      index += 1;
      while (index < sqlText.length && /[0-9_.]/.test(sqlText[index])) {
        index += 1;
      }
      const text = sqlText.slice(start, index);
      tokens.push({
        text,
        normalized: text,
        start,
        end: index,
        depth,
        kind: "number",
      });
      continue;
    }

    index += 1;
  }

  return tokens;
}

export function previousToken(tokens: SqlToken[], index: number): SqlToken | undefined {
  return index > 0 ? tokens[index - 1] : undefined;
}

export function nextToken(tokens: SqlToken[], index: number): SqlToken | undefined {
  return index + 1 < tokens.length ? tokens[index + 1] : undefined;
}

export function findMatchingParen(tokens: SqlToken[], openIndex: number): number {
  let balance = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index]?.text === "(") balance += 1;
    if (tokens[index]?.text === ")") balance -= 1;
    if (balance === 0) return index;
  }
  return -1;
}

export function splitTopLevelSegments(sqlText: string): string[] {
  const tokens = tokenizeSql(sqlText);
  if (tokens.length === 0) return [];

  const segments: string[] = [];
  let segmentStart = 0;

  for (const token of tokens) {
    if (token.text === "," && token.depth === 0) {
      const segment = sqlText.slice(segmentStart, token.start).trim();
      if (segment) segments.push(segment);
      segmentStart = token.end;
    }
  }

  const tail = sqlText.slice(segmentStart).trim();
  if (tail) segments.push(tail);
  return segments;
}

export function resolveStatementWindow(sqlText: string, cursorOffset: number) {
  const tokens = tokenizeSql(sqlText);
  const safeCursor = Math.max(0, Math.min(cursorOffset, sqlText.length));
  let statementStart = 0;
  let statementEnd = sqlText.length;

  for (const token of tokens) {
    if (token.text === ";" && token.depth === 0 && token.start < safeCursor) {
      statementStart = token.end;
    } else if (token.text === ";" && token.depth === 0 && token.start >= safeCursor) {
      statementEnd = token.start;
      break;
    }
  }

  return {
    statementSql: sqlText.slice(statementStart, statementEnd),
    statementOffset: statementStart,
    cursorOffsetInStatement: safeCursor - statementStart,
  };
}
