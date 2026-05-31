import {
  loadSessionForConnection,
  saveSessionForConnection,
} from "./workbench-session";

/** Single query tab state. */
export interface QueryTab {
  id: string;
  label: string;
  sql: string;
  /** Connection ID that owns this tab, or null for legacy/global tabs. */
  connectionId: string | null;
}

/** Bump when the legacy standalone tab storage shape changes. */
export const QUERY_TABS_STORAGE_VERSION = "v1";

/** Versioned localStorage key used by older query-tab persistence. */
export const QUERY_TABS_STORAGE_KEY = `db-workbench:query-tabs:${QUERY_TABS_STORAGE_VERSION}`;

/** Pre-versioned localStorage key retained only for one-time migration. */
const PRE_VERSION_STORAGE_KEY = "db-workbench:query-tabs";

/** Build a new default tab with a fresh browser UUID. */
export function defaultTab(connectionId: string | null = null): QueryTab {
  return {
    id: crypto.randomUUID(),
    label: "Query 1",
    sql: "",
    connectionId,
  };
}

function withConnectionId(tab: QueryTab, connectionId: string): QueryTab {
  return { ...tab, connectionId };
}

function migrateLegacyTabsForConnection(connectionId: string): QueryTab[] | null {
  if (typeof window === "undefined") return null;

  const versionedRaw = window.localStorage.getItem(QUERY_TABS_STORAGE_KEY);
  if (versionedRaw) {
    const migrated = parseTabsFromJson(versionedRaw, "legacy-v1").map((tab) =>
      withConnectionId(tab, connectionId),
    );
    window.localStorage.removeItem(QUERY_TABS_STORAGE_KEY);
    window.localStorage.removeItem(PRE_VERSION_STORAGE_KEY);
    return migrated;
  }

  const preVersionRaw = window.localStorage.getItem(PRE_VERSION_STORAGE_KEY);
  if (preVersionRaw) {
    const migrated = parseTabsFromJson(preVersionRaw, "legacy-pre-v1").map((tab) =>
      withConnectionId(tab, connectionId),
    );
    window.localStorage.removeItem(PRE_VERSION_STORAGE_KEY);
    return migrated;
  }

  return null;
}

export function loadTabsForConnection(connectionId: string): QueryTab[] {
  const normalizedConnectionId = connectionId.trim();
  if (!normalizedConnectionId) {
    return [defaultTab()];
  }

  const session = loadSessionForConnection(normalizedConnectionId);
  if (session.tabs.length > 0) {
    return session.tabs.map((tab) => withConnectionId(tab, normalizedConnectionId));
  }

  const migratedTabs = migrateLegacyTabsForConnection(normalizedConnectionId);
  if (migratedTabs && migratedTabs.length > 0) {
    saveSessionForConnection(normalizedConnectionId, {
      ...session,
      tabs: migratedTabs,
      activeTabId: migratedTabs[0]?.id ?? null,
    });
    return migratedTabs;
  }

  return [defaultTab(normalizedConnectionId)];
}

export function saveTabsForConnection(connectionId: string, tabs: QueryTab[]): void {
  const normalizedConnectionId = connectionId.trim();
  if (!normalizedConnectionId) return;

  const session = loadSessionForConnection(normalizedConnectionId);
  const normalizedTabs = (tabs.length > 0
    ? tabs
    : [defaultTab(normalizedConnectionId)]
  ).map((tab) => withConnectionId(tab, normalizedConnectionId));

  const activeTabId =
    typeof session.activeTabId === "string" &&
    normalizedTabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : normalizedTabs[0]?.id ?? null;

  saveSessionForConnection(normalizedConnectionId, {
    ...session,
    tabs: normalizedTabs,
    activeTabId,
  });
}

/** Backward-compatible global tab loader for older callers. */
export function loadTabs(): QueryTab[] {
  return loadTabsForConnection("global");
}

function parseTabsFromJson(
  raw: string,
  source: "legacy-v1" | "legacy-pre-v1",
): QueryTab[] {
  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn(`[QueryTabs] ${source} storage: invalid structure, resetting to default`);
      return [defaultTab()];
    }

    const validated: QueryTab[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof item.id !== "string" ||
        typeof item.label !== "string" ||
        typeof item.sql !== "string"
      ) {
        console.warn("[QueryTabs] Skipping corrupted tab entry:", item);
        continue;
      }
      validated.push({
        id: item.id,
        label: item.label,
        sql: item.sql,
        connectionId: typeof item.connectionId === "string" ? item.connectionId : null,
      });
    }

    if (validated.length === 0) {
      console.warn(`[QueryTabs] ${source} storage: all entries corrupted, resetting to default`);
      return [defaultTab()];
    }

    return validated;
  } catch (err) {
    console.warn(`[QueryTabs] Failed to parse ${source} storage, resetting to default:`, err);
    return [defaultTab()];
  }
}

/** Backward-compatible global tab saver for older callers. */
export function saveTabs(tabs: QueryTab[]): void {
  saveTabsForConnection("global", tabs);
}
