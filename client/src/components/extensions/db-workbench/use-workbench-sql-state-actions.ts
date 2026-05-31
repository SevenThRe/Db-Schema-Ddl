import { useMemo } from "react";
import {
  createWorkbenchSqlStateActions,
  type WorkbenchSqlStateActions,
} from "./workbench-sql-action-registry";
import type { UseWorkbenchStateActionRegistriesInput } from "./workbench-state-action-registry-types";

export function useWorkbenchSqlStateActions(
  input: UseWorkbenchStateActionRegistriesInput,
): WorkbenchSqlStateActions {
  return useMemo(
    () =>
      createWorkbenchSqlStateActions({
        setSqlCopilotOpen: input.setSqlCopilotOpen,
        setIsRunningSqlCopilotProbe: input.setIsRunningSqlCopilotProbe,
        setSqlCopilotProbeError: input.setSqlCopilotProbeError,
        setSqlCopilotProbeResult: input.setSqlCopilotProbeResult,
        setIsGeneratingSqlCopilotDraft: input.setIsGeneratingSqlCopilotDraft,
        setSqlCopilotGeneratedDraft: input.setSqlCopilotGeneratedDraft,
        setSqlCopilotGenerationError: input.setSqlCopilotGenerationError,
        setIsSavingSqlCopilotSettings: input.setIsSavingSqlCopilotSettings,
        setSqlCopilotSettingsDraft: input.setSqlCopilotSettingsDraft,
        updateSqlCopilotSettingsDraft: input.setSqlCopilotSettingsDraft,
        settingsCache: input.queryClient,
        setSqlMemory: input.setSqlMemory,
        setSqlMemoryOpen: input.setSqlMemoryOpen,
        setPendingSnippetName: input.setPendingSnippetName,
        setSaveSnippetDialogOpen: input.setSaveSnippetDialogOpen,
        setSavedSnippets: input.setSavedSnippets,
        setSqlLibraryOpen: input.setSqlLibraryOpen,
        setSqlLibrarySearch: input.setSqlLibrarySearch,
        setSelectedSqlLibraryEntryId: input.setSelectedSqlLibraryEntryId,
      }),
    [input],
  );
}
