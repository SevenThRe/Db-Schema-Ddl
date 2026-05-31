import { useState } from "react";
import { createDefaultDdlSettings } from "@shared/config";
import type { DbSqlCopilotProbeResponse } from "@shared/schema";
import type { QueryTab } from "./query-tabs-storage";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import type { SqlCopilotGeneratedDraft } from "./sql-copilot-generation";
import { pickSqlCopilotSettings } from "./sql-copilot-settings";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
} from "./workbench-session";
import type { HydratedConnectionSession } from "./workbench-session-hydration";

export function useWorkbenchSqlWorkspaceState(
  initialSession: HydratedConnectionSession,
) {
  const [tabs, setTabs] = useState<QueryTab[]>(initialSession.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(
    initialSession.activeTabId,
  );
  const [recentQueries, setRecentQueries] = useState<string[]>(
    initialSession.recentQueries,
  );
  const [queryHistory, setQueryHistory] = useState<QueryRunHistoryEntry[]>(
    initialSession.queryHistory,
  );
  const [sqlMemory, setSqlMemory] = useState<SqlWorkbenchMemoryState>(
    initialSession.sqlMemory,
  );
  const [savedSnippets, setSavedSnippets] = useState<SavedSqlSnippet[]>(
    initialSession.snippets,
  );
  const [selectedTableName, setSelectedTableName] = useState<string | null>(
    initialSession.selectedTableName,
  );
  const [saveSnippetDialogOpen, setSaveSnippetDialogOpen] = useState(false);
  const [pendingSnippetName, setPendingSnippetName] = useState("");
  const [sqlLibraryOpen, setSqlLibraryOpen] = useState(false);
  const [sqlMemoryOpen, setSqlMemoryOpen] = useState(false);
  const [sqlCopilotOpen, setSqlCopilotOpen] = useState(false);
  const [sqlLibrarySearch, setSqlLibrarySearch] = useState("");
  const [selectedSqlLibraryEntryId, setSelectedSqlLibraryEntryId] = useState("");
  const [sqlCopilotOperatorPrompt, setSqlCopilotOperatorPrompt] = useState("");
  const [sqlCopilotProbeResult, setSqlCopilotProbeResult] =
    useState<DbSqlCopilotProbeResponse | null>(null);
  const [sqlCopilotProbeError, setSqlCopilotProbeError] =
    useState<string | null>(null);
  const [sqlCopilotGeneratedDraft, setSqlCopilotGeneratedDraft] =
    useState<SqlCopilotGeneratedDraft | null>(null);
  const [sqlCopilotGenerationError, setSqlCopilotGenerationError] =
    useState<string | null>(null);
  const [isSavingSqlCopilotSettings, setIsSavingSqlCopilotSettings] =
    useState(false);
  const [isRunningSqlCopilotProbe, setIsRunningSqlCopilotProbe] =
    useState(false);
  const [isGeneratingSqlCopilotDraft, setIsGeneratingSqlCopilotDraft] =
    useState(false);
  const [sqlCopilotSettingsDraft, setSqlCopilotSettingsDraft] =
    useState<SqlCopilotSettingsDraft>(() =>
      pickSqlCopilotSettings(createDefaultDdlSettings()),
    );

  return {
    activeTabId,
    isGeneratingSqlCopilotDraft,
    isRunningSqlCopilotProbe,
    isSavingSqlCopilotSettings,
    pendingSnippetName,
    queryHistory,
    recentQueries,
    savedSnippets,
    saveSnippetDialogOpen,
    selectedSqlLibraryEntryId,
    selectedTableName,
    setActiveTabId,
    setIsGeneratingSqlCopilotDraft,
    setIsRunningSqlCopilotProbe,
    setIsSavingSqlCopilotSettings,
    setPendingSnippetName,
    setQueryHistory,
    setRecentQueries,
    setSavedSnippets,
    setSaveSnippetDialogOpen,
    setSelectedSqlLibraryEntryId,
    setSelectedTableName,
    setSqlCopilotGeneratedDraft,
    setSqlCopilotGenerationError,
    setSqlCopilotOpen,
    setSqlCopilotOperatorPrompt,
    setSqlCopilotProbeError,
    setSqlCopilotProbeResult,
    setSqlCopilotSettingsDraft,
    setSqlLibraryOpen,
    setSqlLibrarySearch,
    setSqlMemory,
    setSqlMemoryOpen,
    setTabs,
    sqlCopilotGeneratedDraft,
    sqlCopilotGenerationError,
    sqlCopilotOpen,
    sqlCopilotOperatorPrompt,
    sqlCopilotProbeError,
    sqlCopilotProbeResult,
    sqlCopilotSettingsDraft,
    sqlLibraryOpen,
    sqlLibrarySearch,
    sqlMemory,
    sqlMemoryOpen,
    tabs,
  };
}
