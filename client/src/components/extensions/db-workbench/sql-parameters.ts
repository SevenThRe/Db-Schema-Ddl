export interface SqlParameterOccurrence {
  name: string;
  start: number;
  end: number;
  syntax: "colon" | "brace";
}

export interface SqlParameterDefinition {
  name: string;
  occurrences: SqlParameterOccurrence[];
}

export interface SqlParameterInputValue {
  rawValue: string;
}

export interface RenderSqlParametersResult {
  sql: string;
  cursorOffset?: number;
}

type ParseState =
  | "normal"
  | "single"
  | "double"
  | "backtick"
  | "line-comment"
  | "block-comment";

function isIdentifierStart(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z_]/.test(character));
}

function isIdentifierPart(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z0-9_]/.test(character));
}

function toSqlLiteral(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";

  if (trimmed.startsWith("=")) {
    const expression = trimmed.slice(1).trim();
    return expression || "''";
  }

  if (/^null$/i.test(trimmed)) return "NULL";
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;

  return `'${trimmed.replace(/'/g, "''")}'`;
}

export function detectSqlParameters(sql: string): SqlParameterDefinition[] {
  const occurrences: SqlParameterOccurrence[] = [];
  let state: ParseState = "normal";

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

      if (current === "{" && next === "{") {
        const closeIndex = sql.indexOf("}}", index + 2);
        if (closeIndex > index + 2) {
          const candidate = sql.slice(index + 2, closeIndex).trim();
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)) {
            occurrences.push({
              name: candidate,
              start: index,
              end: closeIndex + 2,
              syntax: "brace",
            });
            index = closeIndex + 1;
            continue;
          }
        }
      }

      if (current === ":") {
        const previous = sql[index - 1];
        if (previous === ":") {
          continue;
        }
        if (isIdentifierPart(previous)) {
          continue;
        }
        if (isIdentifierStart(next)) {
          let end = index + 2;
          while (end < sql.length && isIdentifierPart(sql[end])) {
            end += 1;
          }
          occurrences.push({
            name: sql.slice(index + 1, end),
            start: index,
            end,
            syntax: "colon",
          });
          index = end - 1;
        }
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
    }
  }

  const grouped = new Map<string, SqlParameterOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = grouped.get(occurrence.name) ?? [];
    list.push(occurrence);
    grouped.set(occurrence.name, list);
  }

  return Array.from(grouped.entries()).map(([name, groupedOccurrences]) => ({
    name,
    occurrences: groupedOccurrences,
  }));
}

export function hasSqlParameters(sql: string): boolean {
  return detectSqlParameters(sql).length > 0;
}

export function renderSqlParameters(
  sql: string,
  values: Record<string, SqlParameterInputValue>,
  cursorOffset?: number,
): RenderSqlParametersResult {
  const parameters = detectSqlParameters(sql);
  if (parameters.length === 0) {
    return {
      sql,
      cursorOffset,
    };
  }

  const occurrences = parameters
    .flatMap((parameter) => parameter.occurrences)
    .sort((left, right) => left.start - right.start);

  let result = "";
  let previousIndex = 0;
  let nextCursorOffset = cursorOffset;

  for (const occurrence of occurrences) {
    result += sql.slice(previousIndex, occurrence.start);
    const renderedValue = toSqlLiteral(values[occurrence.name]?.rawValue ?? "");
    result += renderedValue;

    if (typeof nextCursorOffset === "number") {
      if (nextCursorOffset <= occurrence.start) {
        // Cursor is before this placeholder; do nothing.
      } else if (nextCursorOffset >= occurrence.end) {
        nextCursorOffset += renderedValue.length - (occurrence.end - occurrence.start);
      } else {
        nextCursorOffset = result.length;
      }
    }

    previousIndex = occurrence.end;
  }

  result += sql.slice(previousIndex);

  return {
    sql: result,
    cursorOffset: nextCursorOffset,
  };
}
