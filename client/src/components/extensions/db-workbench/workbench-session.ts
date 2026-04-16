import type { DbObjectKind } from "@shared/schema";

export const MAX_RECENT_QUERIES = 30;
export const MAX_SNIPPETS = 50;
export const MAX_QUERY_HISTORY = 40;

export type WorkbenchResultTab =
  | "results"
  | "explain"
  | "schema-diff"
  | "sync"
  | "inspect"
  | "jobs";

export interface WorkbenchInspectionTarget {
  objectKind: DbObjectKind;
  objectName: string;
  signature: string | null;
  parentObjectName: string | null;
}

export interface SessionQueryTab {
  id: string;
  label: string;
  sql: string;
  connectionId: string | null;
}

export interface SavedSqlSnippet {
  id: string;
  name: string;
  sql: string;
  updatedAt: string;
}

export type QueryRunMode = "statement" | "script";

export type QueryRunStatus = "success" | "partial" | "failed";

export interface QueryRunHistoryEntry {
  id: string;
  sql: string;
  executedAt: string;
  mode: QueryRunMode;
  status: QueryRunStatus;
  statementCount: number;
  returnedRows: number;
  affectedRows: number;
  elapsedMs: number;
  failedStatementIndex: number | null;
  errorMessage: string | null;
}

export interface WorkbenchSessionState {
  tabs: SessionQueryTab[];
  activeTabId: string | null;
  recentQueries: string[];
  queryHistory: QueryRunHistoryEntry[];
  snippets: SavedSqlSnippet[];
  selectedTableName: string | null;
  activeSchema: string | null;
  lastResultTab: WorkbenchResultTab;
  inspectionTarget: WorkbenchInspectionTarget | null;
  schemaDiffTargetConnectionId: string | null;
  syncSourceConnectionId: string | null;
  syncTargetConnectionId: string | null;
  selectedJobId: string | null;
}

const EMPTY_SESSION: WorkbenchSessionState = {
  tabs: [],
  activeTabId: null,
  recentQueries: [],
  queryHistory: [],
  snippets: [],
  selectedTableName: null,
  activeSchema: null,
  lastResultTab: "results",
  inspectionTarget: null,
  schemaDiffTargetConnectionId: null,
  syncSourceConnectionId: null,
  syncTargetConnectionId: null,
  selectedJobId: null,
};

function sessionStorageKey(connectionId: string): string {
  return `db-workbench:session:v2:${connectionId}`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueRecentQueries(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const recent: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = normalizeSql(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    recent.push(trimmed);
    if (recent.length >= MAX_RECENT_QUERIES) break;
  }

  return recent;
}

function sanitizeTabs(values: unknown, connectionId: string): SessionQueryTab[] {
  if (!Array.isArray(values)) return [];

  const tabs: SessionQueryTab[] = [];
  for (const value of values) {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as SessionQueryTab).id !== "string" ||
      typeof (value as SessionQueryTab).label !== "string" ||
      typeof (value as SessionQueryTab).sql !== "string"
    ) {
      continue;
    }

    tabs.push({
      id: (value as SessionQueryTab).id,
      label: (value as SessionQueryTab).label,
      sql: (value as SessionQueryTab).sql,
      connectionId:
        typeof (value as SessionQueryTab).connectionId === "string"
          ? (value as SessionQueryTab).connectionId
          : connectionId,
    });
  }

  return tabs;
}

function sanitizeSnippets(values: unknown): SavedSqlSnippet[] {
  if (!Array.isArray(values)) return [];

  const snippets: SavedSqlSnippet[] = [];
  for (const value of values) {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as SavedSqlSnippet).name !== "string" ||
      typeof (value as SavedSqlSnippet).sql !== "string"
    ) {
      continue;
    }

    const name = (value as SavedSqlSnippet).name.trim();
    const sql = (value as SavedSqlSnippet).sql.trim();
    if (!name || !sql) continue;

    snippets.push({
      id:
        typeof (value as SavedSqlSnippet).id === "string" &&
        (value as SavedSqlSnippet).id.trim()
          ? (value as SavedSqlSnippet).id
          : crypto.randomUUID(),
      name,
      sql,
      updatedAt:
        typeof (value as SavedSqlSnippet).updatedAt === "string" &&
        (value as SavedSqlSnippet).updatedAt.trim()
          ? (value as SavedSqlSnippet).updatedAt
          : new Date().toISOString(),
    });

    if (snippets.length >= MAX_SNIPPETS) break;
  }

  return snippets;
}

function sanitizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isQueryRunMode(value: unknown): value is QueryRunMode {
  return value === "statement" || value === "script";
}

function isQueryRunStatus(value: unknown): value is QueryRunStatus {
  return value === "success" || value === "partial" || value === "failed";
}

function sanitizeNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sanitizeFailedStatementIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function sanitizeQueryHistory(values: unknown): QueryRunHistoryEntry[] {
  if (!Array.isArray(values)) return [];

  const history: QueryRunHistoryEntry[] = [];
  for (const value of values) {
    if (typeof value !== "object" || value === null) continue;

    const sql =
      typeof (value as QueryRunHistoryEntry).sql === "string"
        ? (value as QueryRunHistoryEntry).sql.trim()
        : "";
    if (!sql) continue;

    history.push({
      id:
        typeof (value as QueryRunHistoryEntry).id === "string" &&
        (value as QueryRunHistoryEntry).id.trim()
          ? (value as QueryRunHistoryEntry).id
          : crypto.randomUUID(),
      sql,
      executedAt:
        typeof (value as QueryRunHistoryEntry).executedAt === "string" &&
        (value as QueryRunHistoryEntry).executedAt.trim()
          ? (value as QueryRunHistoryEntry).executedAt
          : new Date().toISOString(),
      mode: isQueryRunMode((value as QueryRunHistoryEntry).mode)
        ? (value as QueryRunHistoryEntry).mode
        : "statement",
      status: isQueryRunStatus((value as QueryRunHistoryEntry).status)
        ? (value as QueryRunHistoryEntry).status
        : "success",
      statementCount: Math.max(
        1,
        Math.trunc(sanitizeNonNegativeNumber((value as QueryRunHistoryEntry).statementCount)),
      ),
      returnedRows: Math.trunc(
        sanitizeNonNegativeNumber((value as QueryRunHistoryEntry).returnedRows),
      ),
      affectedRows: Math.trunc(
        sanitizeNonNegativeNumber((value as QueryRunHistoryEntry).affectedRows),
      ),
      elapsedMs: Math.trunc(sanitizeNonNegativeNumber((value as QueryRunHistoryEntry).elapsedMs)),
      failedStatementIndex: sanitizeFailedStatementIndex(
        (value as QueryRunHistoryEntry).failedStatementIndex,
      ),
      errorMessage: sanitizeOptionalText((value as QueryRunHistoryEntry).errorMessage),
    });

    if (history.length >= MAX_QUERY_HISTORY) break;
  }

  return history;
}

function isWorkbenchResultTab(value: unknown): value is WorkbenchResultTab {
  return (
    value === "results" ||
    value === "explain" ||
    value === "schema-diff" ||
    value === "sync" ||
    value === "inspect" ||
    value === "jobs"
  );
}

function sanitizeInspectionTarget(value: unknown): WorkbenchInspectionTarget | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const maybeTarget = value as Partial<WorkbenchInspectionTarget>;
  if (
    typeof maybeTarget.objectKind !== "string" ||
    typeof maybeTarget.objectName !== "string" ||
    !maybeTarget.objectName.trim()
  ) {
    return null;
  }

  return {
    objectKind: maybeTarget.objectKind as DbObjectKind,
    objectName: maybeTarget.objectName.trim(),
    signature: sanitizeOptionalText(maybeTarget.signature),
    parentObjectName: sanitizeOptionalText(maybeTarget.parentObjectName),
  };
}

function sanitizeSession(
  connectionId: string,
  session: Partial<WorkbenchSessionState>,
): WorkbenchSessionState {
  const tabs = sanitizeTabs(session.tabs, connectionId);
  const activeTabId =
    typeof session.activeTabId === "string" &&
    tabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : tabs[0]?.id ?? null;
  const selectedTableName =
    typeof session.selectedTableName === "string" && session.selectedTableName.trim()
      ? session.selectedTableName
      : null;
  const inspectionTarget = sanitizeInspectionTarget(session.inspectionTarget);
  const requestedResultTab = isWorkbenchResultTab(session.lastResultTab)
    ? session.lastResultTab
    : "results";
  const lastResultTab =
    requestedResultTab === "inspect" && inspectionTarget === null
      ? "results"
      : requestedResultTab;

  return {
    tabs,
    activeTabId,
    recentQueries: uniqueRecentQueries(session.recentQueries),
    queryHistory: sanitizeQueryHistory(session.queryHistory),
    snippets: sanitizeSnippets(session.snippets),
    selectedTableName,
    activeSchema: sanitizeOptionalText(session.activeSchema),
    lastResultTab,
    inspectionTarget,
    schemaDiffTargetConnectionId: sanitizeOptionalText(session.schemaDiffTargetConnectionId),
    syncSourceConnectionId: sanitizeOptionalText(session.syncSourceConnectionId),
    syncTargetConnectionId: sanitizeOptionalText(session.syncTargetConnectionId),
    selectedJobId: sanitizeOptionalText(session.selectedJobId),
  };
}

export function loadSessionForConnection(connectionId: string): WorkbenchSessionState {
  if (typeof window === "undefined") {
    return { ...EMPTY_SESSION };
  }

  const normalizedConnectionId = connectionId.trim();
  if (!normalizedConnectionId) {
    return { ...EMPTY_SESSION };
  }

  const raw = window.localStorage.getItem(sessionStorageKey(normalizedConnectionId));
  if (!raw) {
    return { ...EMPTY_SESSION };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkbenchSessionState>;
    return sanitizeSession(normalizedConnectionId, parsed);
  } catch {
    return { ...EMPTY_SESSION };
  }
}

export function saveSessionForConnection(
  connectionId: string,
  session: Partial<WorkbenchSessionState>,
): WorkbenchSessionState {
  const normalizedConnectionId = connectionId.trim();
  const sanitized = sanitizeSession(normalizedConnectionId, session);

  if (typeof window === "undefined" || !normalizedConnectionId) {
    return sanitized;
  }

  window.localStorage.setItem(
    sessionStorageKey(normalizedConnectionId),
    JSON.stringify(sanitized),
  );
  return sanitized;
}

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

interface RecordQueryRunInput {
  sql: string;
  mode: QueryRunMode;
  status: QueryRunStatus;
  statementCount: number;
  returnedRows?: number;
  affectedRows?: number;
  elapsedMs?: number;
  failedStatementIndex?: number | null;
  errorMessage?: string | null;
  executedAt?: string;
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

  return saveSessionForConnection(connectionId, {
    ...session,
    recentQueries: nextRecentQueries,
    queryHistory: [nextHistoryEntry, ...session.queryHistory].slice(0, MAX_QUERY_HISTORY),
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
