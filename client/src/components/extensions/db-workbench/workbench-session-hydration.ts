import { defaultTab, loadTabsForConnection, type QueryTab } from "./query-tabs-storage";
import {
  loadSessionForConnection,
  type QueryRunHistoryEntry,
  type SavedSqlSnippet,
  type WorkbenchInspectionTarget,
  type WorkbenchResultTab,
  type WorkbenchSessionState,
} from "./workbench-session";
import type { SqlWorkbenchMemoryState } from "./sql-memory";

export interface HydratedConnectionSession {
  tabs: QueryTab[];
  activeTabId: string;
  recentQueries: string[];
  queryHistory: QueryRunHistoryEntry[];
  sqlMemory: SqlWorkbenchMemoryState;
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

export function hydrateConnectionSession(
  connectionId: string,
  session?: WorkbenchSessionState,
): HydratedConnectionSession {
  const normalizedConnectionId = connectionId.trim();
  const loadedSession = session ?? loadSessionForConnection(normalizedConnectionId);
  const loadedTabs =
    loadedSession.tabs.length > 0
      ? loadedSession.tabs.map((tab) => ({
          ...tab,
          connectionId: normalizedConnectionId,
        }))
      : loadTabsForConnection(normalizedConnectionId);

  const tabs =
    loadedTabs.length > 0 ? loadedTabs : [defaultTab(normalizedConnectionId)];
  const fallbackTabId = tabs[0]?.id ?? defaultTab(normalizedConnectionId).id;
  const activeTabId =
    loadedSession.activeTabId &&
    tabs.some((tab) => tab.id === loadedSession.activeTabId)
      ? loadedSession.activeTabId
      : fallbackTabId;

  return {
    tabs,
    activeTabId,
    recentQueries: loadedSession.recentQueries,
    queryHistory: loadedSession.queryHistory,
    sqlMemory: loadedSession.sqlMemory,
    snippets: loadedSession.snippets,
    selectedTableName: loadedSession.selectedTableName,
    activeSchema: loadedSession.activeSchema,
    lastResultTab: loadedSession.lastResultTab,
    inspectionTarget: loadedSession.inspectionTarget,
    schemaDiffTargetConnectionId: loadedSession.schemaDiffTargetConnectionId,
    syncSourceConnectionId: loadedSession.syncSourceConnectionId,
    syncTargetConnectionId: loadedSession.syncTargetConnectionId,
    selectedJobId: loadedSession.selectedJobId,
  };
}
