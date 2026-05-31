// RFC 4180-style CSV parser (pure, dependency-free).
//
// Handles quoted fields, embedded delimiters/newlines inside quotes, escaped
// quotes (""), and both CRLF and LF row terminators. Used by the data-import
// feature to turn pasted/loaded CSV into rows before generating INSERT SQL.

export interface ParseCsvOptions {
  /** Field delimiter; defaults to comma. */
  delimiter?: string;
  /** Treat the first non-empty row as a header row. */
  hasHeader?: boolean;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Tokenize CSV text into a rectangular-ish array of string fields. */
export function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawAnyField = false;
  const delim = delimiter.charAt(0) || ",";

  const endField = () => {
    row.push(field);
    field = "";
    sawAnyField = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawAnyField = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      endField();
    } else if (ch === "\r") {
      // Swallow CR; the following LF (if any) ends the row.
      if (text[i + 1] === "\n") i += 1;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
  }

  // Flush a trailing field/row unless the input ended exactly on a row break.
  if (inQuotes || field.length > 0 || sawAnyField || row.length > 0) {
    endRow();
  }

  return rows;
}

export function parseCsv(text: string, options: ParseCsvOptions = {}): ParsedCsv {
  const rows = parseCsvRows(text, options.delimiter ?? ",").filter(
    (row) => !(row.length === 1 && row[0] === ""),
  );

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  if (options.hasHeader ?? true) {
    const [header, ...body] = rows;
    return { headers: header!.map((h) => h.trim()), rows: body };
  }

  const columnCount = rows[0]!.length;
  const headers = Array.from({ length: columnCount }, (_, index) => `column_${index + 1}`);
  return { headers, rows };
}
