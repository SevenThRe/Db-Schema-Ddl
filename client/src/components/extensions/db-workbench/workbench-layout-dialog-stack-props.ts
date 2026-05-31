import { buildWorkbenchDialogStackInput } from "./workbench-dialog-stack-input";
import { buildWorkbenchDialogStackProps } from "./workbench-dialog-stack-props";
import type {
  BuildWorkbenchLayoutRenderPropsInput,
} from "./workbench-layout-render-props-contract";
import type { WorkbenchRenderContext } from "./workbench-render-context";

export function buildWorkbenchLayoutDialogStackProps({
  input,
  renderContext,
}: {
  input: BuildWorkbenchLayoutRenderPropsInput;
  renderContext: WorkbenchRenderContext;
}) {
  return buildWorkbenchDialogStackProps(
    buildWorkbenchDialogStackInput({
      connection: input.connection,
      activeSchema: input.runtimeSchema ?? null,
      activeSql: input.activeTab?.sql ?? "",
      gridCommit: {
        preparedPlan: input.preparedGridPlan,
        pendingRows: renderContext.pendingEditRows,
        pendingDeletedRows: renderContext.pendingDeletedRows,
        pendingInsertedRows: renderContext.pendingInsertedRowSummaries,
        isConfirming: input.isCommittingGridEdit,
        onConfirm: input.handleCommitGridEdits,
        onCancel: input.gridCommitStateActions.clearPreparedPlan,
      },
      sqlLibrary: {
        open: input.sqlLibraryOpen,
        searchValue: input.sqlLibrarySearch,
        entries: input.filteredSqlLibraryEntries,
        selectedEntryId: input.selectedSqlLibraryEntry?.id ?? "",
        onSearchValueChange: input.setSqlLibrarySearch,
        onSelectedEntryChange: input.setSelectedSqlLibraryEntryId,
        onReplaceActiveTab: input.handleReplaceSqlFromLibrary,
        onOpenInNewTab: input.handleOpenSqlFromLibraryInNewTab,
        onDeleteSnippet: input.handleDeleteSnippetFromLibrary,
        onClose: input.sqlLibraryStateActions.closeLibrary,
      },
      sqlMemory: {
        open: input.sqlMemoryOpen,
        memory: input.sqlMemory,
        onRetentionChange: input.handleSqlMemoryRetentionChange,
        onClearCategory: input.handleClearSqlMemoryCategory,
        onClearCurrentSchema: input.handleClearSqlMemoryCurrentSchema,
        onClearAll: input.handleClearAllSqlMemory,
        onClose: input.sqlMemoryStateActions.closeDialog,
      },
      sqlCopilot: {
        open: input.sqlCopilotOpen,
        settings: input.sqlCopilotSettingsDraft,
        runtimeState: input.sqlCopilotRuntimeState ?? null,
        runtimeLoading: input.isSqlCopilotRuntimeLoading,
        runtimeError: input.sqlCopilotRuntimeErrorMessage,
        hasUnsavedSettings: input.sqlCopilotSettingsDirty,
        promptPackage: input.sqlCopilotPromptPackage,
        generationPromptPackage: input.sqlCopilotGenerationPromptPackage,
        generationMode: input.sqlCopilotGenerationMode,
        operatorPrompt: input.sqlCopilotOperatorPrompt,
        probeResult: input.sqlCopilotProbeResult,
        probeError: input.sqlCopilotProbeError,
        generatedDraft: input.sqlCopilotGeneratedDraft,
        generationError: input.sqlCopilotGenerationError,
        isSavingSettings: input.isSavingSqlCopilotSettings,
        isRunningProbe: input.isRunningSqlCopilotProbe,
        isGeneratingDraft: input.isGeneratingSqlCopilotDraft,
        onSettingChange: input.handleSqlCopilotSettingChange,
        onOperatorPromptChange: input.setSqlCopilotOperatorPrompt,
        onSaveSettings: input.handleSaveSqlCopilotSettings,
        onRunWarmup: input.handleWarmSqlCopilotRuntime,
        onRunProbe: input.handleRunGroundedSqlCopilotProbe,
        onGenerateDraft: input.handleGenerateSqlCopilotDraft,
        onReplaceActiveTabWithDraft:
          input.handleReplaceActiveTabWithGeneratedDraft,
        onOpenDraftInNewTab: input.handleOpenGeneratedDraftInNewTab,
        onRunDraftWithSafetyGates:
          input.handleRunGeneratedDraftWithSafetyGates,
        onClose: input.sqlCopilotStateActions.closeDialog,
      },
      sqlParameters: {
        pendingReview: input.pendingParameterReview,
        values: input.parameterValues,
        renderedSqlPreview: input.renderedParameterReview?.sql,
        onValueChange: input.handleParameterValueChange,
        onConfirm: input.handleConfirmParameterReview,
        onCancel: input.handleCancelParameterReview,
      },
      sqlScriptReview: {
        pendingReview: input.pendingScriptReview,
        stopOnError: input.stopOnError,
        onConfirm: input.handleConfirmScriptReview,
        onCancel: input.handleCancelScriptReview,
      },
      saveSnippet: {
        open: input.saveSnippetDialogOpen,
        snippetName: input.pendingSnippetName,
        willOverwrite: renderContext.willOverwriteSnippet,
        onSnippetNameChange: input.setPendingSnippetName,
        onConfirm: input.handleConfirmSaveSnippet,
        onCancel: input.handleCancelSaveSnippet,
      },
      dangerousSql: {
        preview: input.dangerPreview,
        open: input.showDangerDialog,
        onConfirm: input.handleDangerConfirm,
        onCancel: input.handleDangerCancel,
      },
      tableDesigner: input.tableDesigner
        ? {
            open: input.tableDesigner.open,
            driver: input.connection.driver,
            schemaName: input.runtimeSchema ?? undefined,
            readonly: input.connection.readonly ?? false,
            sourceSchema: input.tableDesigner.sourceSchema,
            onApplyDdl: input.tableDesigner.onApplyDdl,
            onClose: input.tableDesigner.onClose,
          }
        : undefined,
    }),
  );
}
