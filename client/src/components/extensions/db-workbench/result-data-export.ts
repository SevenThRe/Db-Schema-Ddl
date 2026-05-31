// Pure result-set exporters to CSV and JSON (Navicat-style "export grid").
// Operates on already-fetched rows; the CSV output is RFC 4180 and round-trips
// through csv-parse / csv-import-model.

export interface DataExportColumn {
  name: string;
}

type Cell = string | number | boolean | null;

export interface CsvExportOptions {
  delimiter?: string;
  includeHeader?: boolean;
  /** Line terminator; defaults to CRLF (RFC 4180). */
  newline?: string;
}

function csvField(value: Cell, delimiter: string): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  const mustQuote =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");
  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsvExport(
  columns: DataExportColumn[],
  rows: Cell[][],
  options: CsvExportOptions = {},
): string {
  const delimiter = (options.delimiter ?? ",").charAt(0) || ",";
  const newline = options.newline ?? "\r\n";
  const includeHeader = options.includeHeader ?? true;

  const lines: string[] = [];
  if (includeHeader) {
    lines.push(columns.map((column) => csvField(column.name, delimiter)).join(delimiter));
  }
  for (const row of rows) {
    lines.push(
      columns.map((_, index) => csvField(row[index] ?? null, delimiter)).join(delimiter),
    );
  }
  return lines.join(newline);
}

export function buildJsonExport(
  columns: DataExportColumn[],
  rows: Cell[][],
  options: { pretty?: boolean } = {},
): string {
  const records = rows.map((row) => {
    const record: Record<string, Cell> = {};
    columns.forEach((column, index) => {
      record[column.name] = row[index] ?? null;
    });
    return record;
  });
  return JSON.stringify(records, null, options.pretty ? 2 : undefined);
}
