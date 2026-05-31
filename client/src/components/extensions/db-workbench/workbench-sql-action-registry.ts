import type {
  DbSqlCopilotProbeResponse,
} from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import {
  createSqlCopilotStateActions,
  type SqlCopilotStateActions,
} from "./sql-copilot-runner";
import {
  createSqlCopilotSettingsStateActions,
  type SettingsQueryCache,
  type SqlCopilotSettingsStateActions,
} from "./sql-copilot-settings-runner";
import {
  createSqlMemoryStateActions,
  type SqlMemoryStateActions,
} from "./sql-memory-runner";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import {
  createSqlLibraryStateActions,
  type SqlLibraryStateActions,
} from "./sql-library-runner";
import type { SavedSqlSnippet } from "./workbench-session";
import type { SqlCopilotGeneratedDraft } from "./sql-copilot-generation";

export interface WorkbenchSqlStateActions {
  copilot: SqlCopilotStateActions;
  copilotSettings: SqlCopilotSettingsStateActions;
  memory: SqlMemoryStateActions;
  library: SqlLibraryStateActions;
}

export function createWorkbenchSqlStateActions(input: {
  setSqlCopilotOpen: (open: boolean) => void;
  setIsRunningSqlCopilotProbe: (isRunning: boolean) => void;
  setSqlCopilotProbeError: (message: string | null) => void;
  setSqlCopilotProbeResult: (response: DbSqlCopilotProbeResponse) => void;
  setIsGeneratingSqlCopilotDraft: (isGenerating: boolean) => void;
  setSqlCopilotGeneratedDraft: (draft: SqlCopilotGeneratedDraft | null) => void;
  setSqlCopilotGenerationError: (message: string | null) => void;
  setIsSavingSqlCopilotSettings: (isSaving: boolean) => void;
  setSqlCopilotSettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
  updateSqlCopilotSettingsDraft: (
    updater: (current: SqlCopilotSettingsDraft) => SqlCopilotSettingsDraft,
  ) => void;
  settingsCache: SettingsQueryCache;
  setSqlMemory: (memory: SqlWorkbenchMemoryState) => void;
  setSqlMemoryOpen: (open: boolean) => void;
  setPendingSnippetName: (name: string) => void;
  setSaveSnippetDialogOpen: (open: boolean) => void;
  setSavedSnippets: (snippets: SavedSqlSnippet[]) => void;
  setSqlLibraryOpen: (open: boolean) => void;
  setSqlLibrarySearch: (search: string) => void;
  setSelectedSqlLibraryEntryId: (entryId: string) => void;
}): WorkbenchSqlStateActions {
  return {
    copilot: createSqlCopilotStateActions({
      setDialogOpen: input.setSqlCopilotOpen,
      setIsRunningProbe: input.setIsRunningSqlCopilotProbe,
      setProbeError: input.setSqlCopilotProbeError,
      setProbeResult: input.setSqlCopilotProbeResult,
      setIsGeneratingDraft: input.setIsGeneratingSqlCopilotDraft,
      setGeneratedDraft: input.setSqlCopilotGeneratedDraft,
      setGenerationError: input.setSqlCopilotGenerationError,
    }),
    copilotSettings: createSqlCopilotSettingsStateActions({
      setIsSaving: input.setIsSavingSqlCopilotSettings,
      setSettingsDraft: input.setSqlCopilotSettingsDraft,
      updateSettingsDraft: input.updateSqlCopilotSettingsDraft,
      settingsCache: input.settingsCache,
    }),
    memory: createSqlMemoryStateActions({
      setSqlMemory: input.setSqlMemory,
      setDialogOpen: input.setSqlMemoryOpen,
    }),
    library: createSqlLibraryStateActions({
      setPendingSnippetName: input.setPendingSnippetName,
      setSaveDialogOpen: input.setSaveSnippetDialogOpen,
      setSavedSnippets: input.setSavedSnippets,
      setSqlLibraryOpen: input.setSqlLibraryOpen,
      setSqlLibrarySearch: input.setSqlLibrarySearch,
      setSelectedSqlLibraryEntryId: input.setSelectedSqlLibraryEntryId,
    }),
  };
}
