import type { DbConnectionConfig, DbObjectInspectionResponse } from "@shared/schema";
import { defaultTab, type QueryTab } from "./query-tabs-storage";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
  WorkbenchSessionState,
} from "./workbench-session";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import { buildInspectionTargetForSession } from "./object-inspection-runtime";

export function resolveRestoredActiveSchema(input: {
  driver: DbConnectionConfig["driver"];
  restoredActiveSchema: string | null;
  defaultSchema?: string | null;
}): string {
  if (input.driver !== "postgres") {
    return "public";
  }

  return input.restoredActiveSchema ?? input.defaultSchema?.trim() ?? "public";
}

export function repairActiveQueryTabs(input: {
  tabs: QueryTab[];
  activeTabId: string;
  connectionId: string;
}): {
  tabs: QueryTab[];
  activeTabId: string;
  changed: boolean;
} {
  if (input.tabs.length === 0) {
    const tab = defaultTab(input.connectionId);
    return {
      tabs: [tab],
      activeTabId: tab.id,
      changed: true,
    };
  }

  if (input.tabs.some((tab) => tab.id === input.activeTabId)) {
    return {
      tabs: input.tabs,
      activeTabId: input.activeTabId,
      changed: false,
    };
  }

  return {
    tabs: input.tabs,
    activeTabId: input.tabs[0]?.id ?? input.activeTabId,
    changed: true,
  };
}

export function buildWorkbenchSessionPersistenceState(input: {
  connectionId: string;
  driver: DbConnectionConfig["driver"];
  tabs: QueryTab[];
  activeTabId: string;
  recentQueries: string[];
  queryHistory: QueryRunHistoryEntry[];
  sqlMemory: SqlWorkbenchMemoryState;
  savedSnippets: SavedSqlSnippet[];
  selectedTableName: string | null;
  activeSchema: string;
  resultTab: WorkbenchResultTab;
  objectInspection: DbObjectInspectionResponse | null;
  restoredInspectionTarget: WorkbenchInspectionTarget | null;
  schemaDiffTargetConnectionId: string;
  syncSourceConnectionId: string;
  syncTargetConnectionId: string;
  selectedJobId: string | null;
}): WorkbenchSessionState {
  return {
    tabs: input.tabs.map((tab) => ({ ...tab, connectionId: input.connectionId })),
    activeTabId: input.activeTabId,
    recentQueries: input.recentQueries,
    queryHistory: input.queryHistory,
    sqlMemory: input.sqlMemory,
    snippets: input.savedSnippets,
    selectedTableName: input.selectedTableName,
    activeSchema: input.driver === "postgres" ? input.activeSchema : null,
    lastResultTab: input.resultTab,
    inspectionTarget: buildInspectionTargetForSession(
      input.objectInspection,
      input.restoredInspectionTarget,
    ),
    schemaDiffTargetConnectionId: input.schemaDiffTargetConnectionId,
    syncSourceConnectionId: input.syncSourceConnectionId,
    syncTargetConnectionId: input.syncTargetConnectionId,
    selectedJobId: input.selectedJobId,
  };
}
