import type { Dispatch, SetStateAction } from "react";
import type { DbConnectionConfig, DbObjectInspectionResponse } from "@shared/schema";
import type { QueryTab } from "./query-tabs-storage";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
  WorkbenchSessionState,
} from "./workbench-session";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import {
  buildWorkbenchSessionPersistenceState,
  repairActiveQueryTabs,
} from "./workbench-session-runtime";

export function runRepairActiveQueryTabSelection(input: {
  tabs: QueryTab[];
  activeTabId: string;
  connectionId: string;
  setTabs: Dispatch<SetStateAction<QueryTab[]>>;
  setActiveTabId: (tabId: string) => void;
}): boolean {
  const repaired = repairActiveQueryTabs({
    tabs: input.tabs,
    activeTabId: input.activeTabId,
    connectionId: input.connectionId,
  });

  if (!repaired.changed) return false;

  input.setTabs(repaired.tabs);
  input.setActiveTabId(repaired.activeTabId);
  return true;
}

export function runPersistWorkbenchSession(input: {
  connection: Pick<DbConnectionConfig, "id" | "driver">;
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
  saveSession: (connectionId: string, state: WorkbenchSessionState) => void;
}): boolean {
  if (!input.connection.id) return false;

  input.saveSession(
    input.connection.id,
    buildWorkbenchSessionPersistenceState({
      connectionId: input.connection.id,
      driver: input.connection.driver,
      tabs: input.tabs,
      activeTabId: input.activeTabId,
      recentQueries: input.recentQueries,
      queryHistory: input.queryHistory,
      sqlMemory: input.sqlMemory,
      savedSnippets: input.savedSnippets,
      selectedTableName: input.selectedTableName,
      activeSchema: input.activeSchema,
      resultTab: input.resultTab,
      objectInspection: input.objectInspection,
      restoredInspectionTarget: input.restoredInspectionTarget,
      schemaDiffTargetConnectionId: input.schemaDiffTargetConnectionId,
      syncSourceConnectionId: input.syncSourceConnectionId,
      syncTargetConnectionId: input.syncTargetConnectionId,
      selectedJobId: input.selectedJobId,
    }),
  );
  return true;
}
