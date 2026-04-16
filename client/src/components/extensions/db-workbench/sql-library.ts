import type {
  QueryRunHistoryEntry,
  QueryRunStatus,
  SavedSqlSnippet,
} from "./workbench-session";

export type SqlLibraryEntryKind = "snippet" | "recent" | "history";

export interface SqlLibraryEntry {
  id: string;
  kind: SqlLibraryEntryKind;
  title: string;
  sql: string;
  groupLabel: string;
  summary: string;
  searchableText: string;
  updatedAt: string | null;
  snippetId: string | null;
  meta: string | null;
  status: QueryRunStatus | null;
}

const SUMMARY_LIMIT = 88;

function collapseSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

export function summarizeSql(sql: string, limit = SUMMARY_LIMIT): string {
  const singleLine = collapseSql(sql);
  if (!singleLine) return "(empty SQL)";
  if (singleLine.length <= limit) return singleLine;
  return `${singleLine.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace("T", " ").slice(0, 16);
}

function formatRunMeta(entry: QueryRunHistoryEntry): string {
  const parts: string[] = [
    entry.mode === "script" ? "Script" : "Statement",
    `${entry.statementCount} statement${entry.statementCount === 1 ? "" : "s"}`,
  ];

  if (entry.returnedRows > 0) {
    parts.push(`${entry.returnedRows.toLocaleString()} row${entry.returnedRows === 1 ? "" : "s"}`);
  }
  if (entry.affectedRows > 0) {
    parts.push(
      `${entry.affectedRows.toLocaleString()} affected row${entry.affectedRows === 1 ? "" : "s"}`,
    );
  }
  if (entry.failedStatementIndex !== null) {
    parts.push(`failed @ #${entry.failedStatementIndex + 1}`);
  }
  if (entry.elapsedMs > 0) {
    parts.push(`${entry.elapsedMs.toLocaleString()} ms`);
  }

  const timestamp = formatTimestamp(entry.executedAt);
  if (timestamp) {
    parts.push(timestamp);
  }

  return parts.join(" · ");
}

export function buildSqlLibraryEntries(
  snippets: SavedSqlSnippet[],
  recentQueries: string[],
  queryHistory: QueryRunHistoryEntry[] = [],
): SqlLibraryEntry[] {
  const snippetEntries = snippets.map((snippet) => ({
    id: `snippet:${snippet.id}`,
    kind: "snippet" as const,
    title: snippet.name,
    sql: snippet.sql,
    groupLabel: "Saved snippets",
    summary: summarizeSql(snippet.sql),
    searchableText: normalizeSearch(`${snippet.name}\n${snippet.sql}`),
    updatedAt: snippet.updatedAt,
    snippetId: snippet.id,
    meta: formatTimestamp(snippet.updatedAt)
      ? `Saved ${formatTimestamp(snippet.updatedAt)}`
      : null,
    status: null,
  }));

  const historyEntries = queryHistory.map((entry) => ({
    id: `history:${entry.id}`,
    kind: "history" as const,
    title: entry.mode === "script" ? "Script run" : "Statement run",
    sql: entry.sql,
    groupLabel: "Run history",
    summary: summarizeSql(entry.sql),
    searchableText: normalizeSearch(
      `${entry.sql}\n${entry.status}\n${entry.mode}\n${entry.errorMessage ?? ""}`,
    ),
    updatedAt: entry.executedAt,
    snippetId: null,
    meta: formatRunMeta(entry),
    status: entry.status,
  }));

  const recentEntries =
    historyEntries.length === 0
      ? recentQueries.map((sql, index) => ({
          id: `recent:${index}`,
          kind: "recent" as const,
          title: `Recent query ${index + 1}`,
          sql,
          groupLabel: "Recent queries",
          summary: summarizeSql(sql),
          searchableText: normalizeSearch(sql),
          updatedAt: null,
          snippetId: null,
          meta: "Imported from legacy recent queries",
          status: null,
        }))
      : [];

  return [...snippetEntries, ...historyEntries, ...recentEntries];
}

export function filterSqlLibraryEntries(
  entries: SqlLibraryEntry[],
  query: string,
): SqlLibraryEntry[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return entries;

  return entries.filter((entry) => entry.searchableText.includes(normalizedQuery));
}

export function buildSqlPreview(sql: string, maxLines = 12): string[] {
  const trimmed = sql.trim();
  if (!trimmed) return ["-- No SQL available."];

  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines), `-- ${lines.length - maxLines} more line(s)`];
}
