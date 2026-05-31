import type { QueryExecutionResponse } from "@shared/schema";
import { recordQueryPattern, recordValueProfiles } from "./sql-memory";
import {
  MAX_QUERY_HISTORY,
  MAX_RECENT_QUERIES,
  MAX_SNIPPETS,
  normalizeSql,
  sanitizeOptionalText,
} from "./workbench-session-codec";
import {
  loadSessionForConnection,
  saveSessionForConnection,
} from "./workbench-session-store";
import type {
  QueryRunHistoryEntry,
  QueryRunMode,
  QueryRunStatus,
  RecordQueryRunInput,
  WorkbenchSessionState,
} from "./workbench-session-types";

export function appendRecentQuery(
  connectionId: string,
  sql: string,
): WorkbenchSessionState {
  const trimmedSql = sql.trim();
  const session = loadSessionForConnection(connectionId);
  if (!trimmedSql) return session;

  const normalizedTarget = normalizeSql(trimmedSql);
  const deduped = session.recentQueries.filter(
    (entry) => normalizeSql(entry) !== normalizedTarget,
  );
  const nextRecentQueries = [trimmedSql, ...deduped].slice(0, MAX_RECENT_QUERIES);

  return saveSessionForConnection(connectionId, {
    ...session,
    recentQueries: nextRecentQueries,
  });
}

export function buildQueryRunEntryFromResponse(
  sql: string,
  mode: QueryRunMode,
  response: QueryExecutionResponse,
): RecordQueryRunInput {
  const failedIndexes = response.batches.flatMap((batch, index) =>
    batch.error ? [index] : [],
  );
  const status: QueryRunStatus =
    failedIndexes.length === 0
      ? "success"
      : failedIndexes.length === response.batches.length
        ? "failed"
        : "partial";

  return {
    sql,
    mode,
    status,
    statementCount: Math.max(1, response.batches.length),
    returnedRows: response.batches.reduce((sum, batch) => sum + batch.returnedRows, 0),
    affectedRows: response.batches.reduce(
      (sum, batch) => sum + (typeof batch.affectedRows === "number" ? batch.affectedRows : 0),
      0,
    ),
    elapsedMs: response.batches.reduce((sum, batch) => sum + batch.elapsedMs, 0),
    failedStatementIndex: failedIndexes[0] ?? null,
    errorMessage:
      failedIndexes.length > 0 ? response.batches[failedIndexes[0]]?.error ?? null : null,
  };
}

export function recordQueryRun(
  connectionId: string,
  run: RecordQueryRunInput,
): WorkbenchSessionState {
  const trimmedSql = run.sql.trim();
  const session = loadSessionForConnection(connectionId);
  if (!trimmedSql) return session;

  const normalizedTarget = normalizeSql(trimmedSql);
  const nextRecentQueries = [
    trimmedSql,
    ...session.recentQueries.filter((entry) => normalizeSql(entry) !== normalizedTarget),
  ].slice(0, MAX_RECENT_QUERIES);

  const nextHistoryEntry: QueryRunHistoryEntry = {
    id: crypto.randomUUID(),
    sql: trimmedSql,
    executedAt: run.executedAt?.trim() ? run.executedAt : new Date().toISOString(),
    mode: run.mode,
    status: run.status,
    statementCount: Math.max(1, Math.trunc(run.statementCount)),
    returnedRows: Math.max(0, Math.trunc(run.returnedRows ?? 0)),
    affectedRows: Math.max(0, Math.trunc(run.affectedRows ?? 0)),
    elapsedMs: Math.max(0, Math.trunc(run.elapsedMs ?? 0)),
    failedStatementIndex:
      typeof run.failedStatementIndex === "number" &&
      Number.isInteger(run.failedStatementIndex) &&
      run.failedStatementIndex >= 0
        ? run.failedStatementIndex
        : null,
    errorMessage: sanitizeOptionalText(run.errorMessage),
  };

  const nextMemory = recordValueProfiles(
    run.memoryPattern
      ? recordQueryPattern(session.sqlMemory, run.memoryPattern)
      : session.sqlMemory,
    run.valueProfiles ?? [],
  );

  return saveSessionForConnection(connectionId, {
    ...session,
    recentQueries: nextRecentQueries,
    queryHistory: [nextHistoryEntry, ...session.queryHistory].slice(0, MAX_QUERY_HISTORY),
    sqlMemory: nextMemory,
  });
}

export function saveSnippet(
  connectionId: string,
  name: string,
  sql: string,
): WorkbenchSessionState {
  const trimmedName = name.trim();
  const trimmedSql = sql.trim();
  const session = loadSessionForConnection(connectionId);

  if (!trimmedName || !trimmedSql) return session;

  const now = new Date().toISOString();
  const existingIndex = session.snippets.findIndex(
    (snippet) => snippet.name.toLowerCase() === trimmedName.toLowerCase(),
  );

  const nextSnippets = [...session.snippets];
  if (existingIndex >= 0) {
    const current = nextSnippets[existingIndex];
    nextSnippets.splice(existingIndex, 1);
    nextSnippets.unshift({
      ...current,
      name: trimmedName,
      sql: trimmedSql,
      updatedAt: now,
    });
  } else {
    nextSnippets.unshift({
      id: crypto.randomUUID(),
      name: trimmedName,
      sql: trimmedSql,
      updatedAt: now,
    });
  }

  return saveSessionForConnection(connectionId, {
    ...session,
    snippets: nextSnippets.slice(0, MAX_SNIPPETS),
  });
}

export function deleteSnippet(
  connectionId: string,
  snippetId: string,
): WorkbenchSessionState {
  const normalizedSnippetId = snippetId.trim();
  const session = loadSessionForConnection(connectionId);

  if (!normalizedSnippetId) return session;

  return saveSessionForConnection(connectionId, {
    ...session,
    snippets: session.snippets.filter((snippet) => snippet.id !== normalizedSnippetId),
  });
}
