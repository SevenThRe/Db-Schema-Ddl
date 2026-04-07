export const MAX_RECENT_QUERIES = 30;
export const MAX_SNIPPETS = 50;

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

export interface WorkbenchSessionState {
  tabs: SessionQueryTab[];
  activeTabId: string | null;
  recentQueries: string[];
  snippets: SavedSqlSnippet[];
}

const EMPTY_SESSION: WorkbenchSessionState = {
  tabs: [],
  activeTabId: null,
  recentQueries: [],
  snippets: [],
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

  return {
    tabs,
    activeTabId,
    recentQueries: uniqueRecentQueries(session.recentQueries),
    snippets: sanitizeSnippets(session.snippets),
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
