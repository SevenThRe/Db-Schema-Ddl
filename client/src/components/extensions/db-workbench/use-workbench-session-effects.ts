import {
  type Dispatch,
  type SetStateAction,
  useEffect,
} from "react";
import type {
  DbConnectionConfig,
  DbObjectInspectionResponse,
} from "@shared/schema";

import type { QueryTab } from "./query-tabs-storage";
import type { SqlLibraryEntry } from "./sql-library";
import type { SqlLibraryStateActions } from "./sql-library-runner";
import { runResolveSqlLibrarySelection } from "./sql-library-runner";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import type {
  HydratedConnectionSession,
} from "./workbench-session-hydration";
import {
  runPersistWorkbenchSession,
  runRepairActiveQueryTabSelection,
} from "./workbench-session-runner";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
  WorkbenchSessionState,
} from "./workbench-session";
import type { WorkbenchConnectionRestoreActions } from "./workbench-session-restore-runner";
import {
  runWorkbenchConnectionRestore,
} from "./workbench-session-restore-runner";

export interface UseWorkbenchSessionEffectsInput {
  connection: Pick<DbConnectionConfig, "id" | "driver" | "defaultSchema">;
  hydrateSession: (connectionId: string) => HydratedConnectionSession;
  connectionRestoreActions: WorkbenchConnectionRestoreActions;
  sqlLibraryOpen: boolean;
  filteredSqlLibraryEntries: SqlLibraryEntry[];
  selectedSqlLibraryEntryId: string;
  sqlLibraryStateActions: SqlLibraryStateActions;
  tabs: QueryTab[];
  activeTabId: string;
  setTabs: Dispatch<SetStateAction<QueryTab[]>>;
  setActiveTabId: (tabId: string) => void;
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
}

export function useWorkbenchSessionEffects({
  connection,
  hydrateSession,
  connectionRestoreActions,
  sqlLibraryOpen,
  filteredSqlLibraryEntries,
  selectedSqlLibraryEntryId,
  sqlLibraryStateActions,
  tabs,
  activeTabId,
  setTabs,
  setActiveTabId,
  recentQueries,
  queryHistory,
  sqlMemory,
  savedSnippets,
  selectedTableName,
  activeSchema,
  resultTab,
  objectInspection,
  restoredInspectionTarget,
  schemaDiffTargetConnectionId,
  syncSourceConnectionId,
  syncTargetConnectionId,
  selectedJobId,
  saveSession,
}: UseWorkbenchSessionEffectsInput): void {
  useEffect(() => {
    runWorkbenchConnectionRestore({
      connection: {
        id: connection.id,
        driver: connection.driver,
        defaultSchema: connection.defaultSchema,
      },
      hydrateSession,
      actions: connectionRestoreActions,
    });
  }, [
    connection.defaultSchema,
    connection.driver,
    connection.id,
    connectionRestoreActions,
    hydrateSession,
  ]);

  useEffect(() => {
    runResolveSqlLibrarySelection({
      isOpen: sqlLibraryOpen,
      entries: filteredSqlLibraryEntries,
      selectedEntryId: selectedSqlLibraryEntryId,
      setSelectedEntryId: sqlLibraryStateActions.setSelectedEntryId,
    });
  }, [
    filteredSqlLibraryEntries,
    selectedSqlLibraryEntryId,
    sqlLibraryOpen,
    sqlLibraryStateActions,
  ]);

  useEffect(() => {
    runRepairActiveQueryTabSelection({
      tabs,
      activeTabId,
      connectionId: connection.id,
      setTabs,
      setActiveTabId,
    });
  }, [activeTabId, connection.id, setActiveTabId, setTabs, tabs]);

  useEffect(() => {
    runPersistWorkbenchSession({
      connection: {
        id: connection.id,
        driver: connection.driver,
      },
      tabs,
      activeTabId,
      recentQueries,
      queryHistory,
      sqlMemory,
      savedSnippets,
      selectedTableName,
      activeSchema,
      resultTab,
      objectInspection,
      restoredInspectionTarget,
      schemaDiffTargetConnectionId,
      syncSourceConnectionId,
      syncTargetConnectionId,
      selectedJobId,
      saveSession,
    });
  }, [
    activeSchema,
    activeTabId,
    connection.driver,
    connection.id,
    objectInspection,
    queryHistory,
    recentQueries,
    restoredInspectionTarget,
    resultTab,
    saveSession,
    savedSnippets,
    schemaDiffTargetConnectionId,
    selectedJobId,
    selectedTableName,
    sqlMemory,
    syncSourceConnectionId,
    syncTargetConnectionId,
    tabs,
  ]);
}
