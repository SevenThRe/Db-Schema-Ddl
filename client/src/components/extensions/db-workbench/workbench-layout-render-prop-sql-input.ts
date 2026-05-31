import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropSqlInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { backendQueries, contextModels, sqlWorkspaceState } = input;
  const { sqlCopilotContext, sqlWorkspaceContext } = contextModels;
  const {
    activeTab,
    filteredSqlLibraryEntries,
    selectedSqlLibraryEntry,
  } = sqlWorkspaceContext;

  return {
    activeTab,
    effectiveDdlSettings: sqlCopilotContext.effectiveSettings,
    filteredSqlLibraryEntries,
    isGeneratingSqlCopilotDraft:
      sqlWorkspaceState.isGeneratingSqlCopilotDraft,
    isRunningSqlCopilotProbe: sqlWorkspaceState.isRunningSqlCopilotProbe,
    isSavingSqlCopilotSettings: sqlWorkspaceState.isSavingSqlCopilotSettings,
    isSqlCopilotRuntimeLoading: backendQueries.isSqlCopilotRuntimeLoading,
    pendingSnippetName: sqlWorkspaceState.pendingSnippetName,
    queryHistory: sqlWorkspaceState.queryHistory,
    recentQueries: sqlWorkspaceState.recentQueries,
    saveSnippetDialogOpen: sqlWorkspaceState.saveSnippetDialogOpen,
    savedSnippets: sqlWorkspaceState.savedSnippets,
    selectedSqlLibraryEntry,
    sqlCopilotGeneratedDraft: sqlWorkspaceState.sqlCopilotGeneratedDraft,
    sqlCopilotGenerationError: sqlWorkspaceState.sqlCopilotGenerationError,
    sqlCopilotGenerationMode: sqlCopilotContext.generationMode,
    sqlCopilotGenerationPromptPackage:
      sqlCopilotContext.generationPromptPackage,
    sqlCopilotOpen: sqlWorkspaceState.sqlCopilotOpen,
    sqlCopilotOperatorPrompt: sqlWorkspaceState.sqlCopilotOperatorPrompt,
    sqlCopilotProbeError: sqlWorkspaceState.sqlCopilotProbeError,
    sqlCopilotProbeResult: sqlWorkspaceState.sqlCopilotProbeResult,
    sqlCopilotPromptPackage: sqlCopilotContext.promptPackage,
    sqlCopilotRuntimeErrorMessage:
      sqlCopilotContext.runtimeErrorMessage,
    sqlCopilotRuntimeState: backendQueries.sqlCopilotRuntimeState,
    sqlCopilotSettingsDirty: sqlCopilotContext.settingsDirty,
    sqlCopilotSettingsDraft: sqlWorkspaceState.sqlCopilotSettingsDraft,
    sqlLibraryOpen: sqlWorkspaceState.sqlLibraryOpen,
    sqlLibrarySearch: sqlWorkspaceState.sqlLibrarySearch,
    sqlMemory: sqlWorkspaceState.sqlMemory,
    sqlMemoryOpen: sqlWorkspaceState.sqlMemoryOpen,
    tabs: sqlWorkspaceState.tabs,
  };
}
