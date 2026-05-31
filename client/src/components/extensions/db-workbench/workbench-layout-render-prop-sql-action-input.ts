import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropSqlActionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { sqlControllers } = input;

  return {
    handleCancelSaveSnippet: sqlControllers.handleCancelSaveSnippet,
    handleClearAllSqlMemory: sqlControllers.handleClearAllSqlMemory,
    handleClearSqlMemoryCategory: sqlControllers.handleClearSqlMemoryCategory,
    handleClearSqlMemoryCurrentSchema:
      sqlControllers.handleClearSqlMemoryCurrentSchema,
    handleCompletionAccepted: sqlControllers.handleCompletionAccepted,
    handleConfirmSaveSnippet: sqlControllers.handleConfirmSaveSnippet,
    handleDeleteSnippetFromLibrary: sqlControllers.handleDeleteSnippetFromLibrary,
    handleGenerateSqlCopilotDraft:
      sqlControllers.handleGenerateSqlCopilotDraft,
    handleOpenGeneratedDraftInNewTab:
      sqlControllers.handleOpenGeneratedDraftInNewTab,
    handleOpenSqlCopilot: sqlControllers.handleOpenSqlCopilot,
    handleOpenSqlFromLibraryInNewTab:
      sqlControllers.handleOpenSqlFromLibraryInNewTab,
    handleOpenSqlLibrary: sqlControllers.handleOpenSqlLibrary,
    handleOpenSqlMemory: sqlControllers.handleOpenSqlMemory,
    handleReplaceActiveTabWithGeneratedDraft:
      sqlControllers.handleReplaceActiveTabWithGeneratedDraft,
    handleReplaceSqlFromLibrary: sqlControllers.handleReplaceSqlFromLibrary,
    handleRunGeneratedDraftWithSafetyGates:
      sqlControllers.handleRunGeneratedDraftWithSafetyGates,
    handleRunGroundedSqlCopilotProbe:
      sqlControllers.handleRunGroundedSqlCopilotProbe,
    handleSaveSnippet: sqlControllers.handleSaveSnippet,
    handleSaveSqlCopilotSettings:
      sqlControllers.handleSaveSqlCopilotSettings,
    handleSqlCopilotSettingChange:
      sqlControllers.handleSqlCopilotSettingChange,
    handleSqlMemoryRetentionChange:
      sqlControllers.handleSqlMemoryRetentionChange,
    handleWarmSqlCopilotRuntime: sqlControllers.handleWarmSqlCopilotRuntime,
  };
}
