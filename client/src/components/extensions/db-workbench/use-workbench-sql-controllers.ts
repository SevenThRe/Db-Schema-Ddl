import { useCallback, useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { desktopBridge } from "@/lib/desktop-bridge";
import type { ToastOptions } from "@/extensions/host-api";
import type {
  DbGridEditSource,
  DbSqlCopilotPromptPackage,
  DbSqlCopilotProbeRequest,
  DbSqlCopilotProbeResponse,
  DdlSettings,
} from "@shared/schema";
import {
  clearSqlMemory,
  deleteSnippet,
  recordAcceptedSqlSuggestion,
  saveSnippet,
  updateSqlMemoryRetentionSettings,
} from "./workbench-session";
import type { SqlLibraryEntry } from "./sql-library";
import type {
  SqlMemoryAcceptedSuggestionInput,
  SqlMemoryRetentionSettings,
} from "./sql-memory";
import type { SqlMemoryCategory, SqlMemoryStateActions } from "./sql-memory-runner";
import type { SqlLibraryStateActions } from "./sql-library-runner";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import type {
  SqlCopilotGeneratedDraft,
  SqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import type { SqlSemanticContext } from "./sql-semantic-types";
import type {
  SqlCopilotStateActions,
} from "./sql-copilot-runner";
import type {
  SqlCopilotSettingsStateActions,
} from "./sql-copilot-settings-runner";
import {
  createWorkbenchSqlCopilotController,
} from "./workbench-sql-copilot-controller";
import {
  createWorkbenchSqlLibraryController,
} from "./workbench-sql-library-controller";
import {
  createWorkbenchSqlMemoryController,
} from "./workbench-sql-memory-controller";
import { invalidateSettingsQuery } from "./workbench-query-cache";

export interface WorkbenchSqlControllers {
  handleOpenSqlLibrary: () => void;
  handleOpenSqlMemory: () => void;
  handleClearAllSqlMemory: () => void;
  handleClearSqlMemoryCategory: (category: SqlMemoryCategory) => void;
  handleClearSqlMemoryCurrentSchema: () => void;
  handleCompletionAccepted: (suggestion: SqlMemoryAcceptedSuggestionInput) => void;
  handleSqlMemoryRetentionChange: (
    key: keyof SqlMemoryRetentionSettings,
    checked: boolean,
  ) => void;
  handleCancelSaveSnippet: () => void;
  handleConfirmSaveSnippet: () => void;
  handleDeleteSnippetFromLibrary: () => void;
  handleOpenSqlFromLibraryInNewTab: () => void;
  handleReplaceSqlFromLibrary: () => void;
  handleSaveSnippet: () => void;
  handleGenerateSqlCopilotDraft: () => Promise<void>;
  handleOpenGeneratedDraftInNewTab: () => void;
  handleOpenSqlCopilot: () => void;
  handleReplaceActiveTabWithGeneratedDraft: () => void;
  handleRunGeneratedDraftWithSafetyGates: () => Promise<void>;
  handleRunGroundedSqlCopilotProbe: () => void;
  handleSaveSqlCopilotSettings: () => Promise<void>;
  handleSqlCopilotSettingChange: <K extends keyof SqlCopilotSettingsDraft>(
    key: K,
    value: SqlCopilotSettingsDraft[K],
  ) => void;
  handleWarmSqlCopilotRuntime: () => void;
}

export interface UseWorkbenchSqlControllersInput {
  activeLabel?: string | null;
  activeSql: string;
  connectionId: string;
  effectiveSettings: DdlSettings;
  executeScript: (sql: string) => Promise<unknown>;
  executeStatement: (
    sql: string,
    source: DbGridEditSource,
    mode: "statement",
    cursorOffset?: number,
  ) => Promise<unknown>;
  focusSqlEditor: () => void;
  generatedDraft: SqlCopilotGeneratedDraft | null;
  generationMode: SqlCopilotGenerationMode;
  generationPromptPackage: DbSqlCopilotPromptPackage;
  generationSemanticContext: SqlSemanticContext | null;
  insertSqlIntoActiveTab: (sql: string) => void;
  openSqlInNewTab: (sql: string, label: string) => void;
  pendingSnippetName: string;
  promptPackage: DbSqlCopilotPromptPackage;
  queryClient: QueryClient;
  refetchSqlCopilotRuntime: () => Promise<unknown>;
  runSqlCopilotProbe: (
    request: DbSqlCopilotProbeRequest,
  ) => Promise<DbSqlCopilotProbeResponse>;
  runtimeSchema?: string;
  selectedSqlLibraryEntry: SqlLibraryEntry | null;
  showNotification: (notice: ToastOptions) => void;
  sqlCopilotSettingsDirty: boolean;
  sqlCopilotSettingsStateActions: SqlCopilotSettingsStateActions;
  sqlCopilotStateActions: SqlCopilotStateActions;
  sqlLibraryEntries: SqlLibraryEntry[];
  sqlLibraryStateActions: SqlLibraryStateActions;
  sqlMemoryStateActions: SqlMemoryStateActions;
}

export function useWorkbenchSqlControllers(
  input: UseWorkbenchSqlControllersInput,
): WorkbenchSqlControllers {
  const handleOpenSqlLibrary = useCallback(() => {
    input.sqlLibraryStateActions.openLibrary(input.sqlLibraryEntries[0]?.id ?? "");
  }, [input.sqlLibraryEntries, input.sqlLibraryStateActions]);

  const handleOpenSqlMemory = useCallback(() => {
    input.sqlMemoryStateActions.openDialog();
  }, [input.sqlMemoryStateActions]);

  const sqlMemoryController = useMemo(
    () =>
      createWorkbenchSqlMemoryController({
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        actions: input.sqlMemoryStateActions,
        recordAcceptedSuggestion: recordAcceptedSqlSuggestion,
        updateRetention: updateSqlMemoryRetentionSettings,
        clearMemory: clearSqlMemory,
        showNotification: input.showNotification,
      }),
    [
      input.connectionId,
      input.runtimeSchema,
      input.showNotification,
      input.sqlMemoryStateActions,
    ],
  );

  const sqlLibraryController = useMemo(
    () =>
      createWorkbenchSqlLibraryController({
        activeSql: input.activeSql,
        activeLabel: input.activeLabel,
        connectionId: input.connectionId,
        pendingSnippetName: input.pendingSnippetName,
        selectedEntry: input.selectedSqlLibraryEntry,
        actions: input.sqlLibraryStateActions,
        saveSnippet,
        deleteSnippet,
        replaceSql: input.insertSqlIntoActiveTab,
        openSqlInNewTab: input.openSqlInNewTab,
        showNotification: input.showNotification,
      }),
    [
      input.activeLabel,
      input.activeSql,
      input.connectionId,
      input.insertSqlIntoActiveTab,
      input.openSqlInNewTab,
      input.pendingSnippetName,
      input.selectedSqlLibraryEntry,
      input.showNotification,
      input.sqlLibraryStateActions,
    ],
  );

  const sqlCopilotController = useMemo(
    () =>
      createWorkbenchSqlCopilotController({
        effectiveSettings: input.effectiveSettings,
        settingsDirty: input.sqlCopilotSettingsDirty,
        promptPackage: input.promptPackage,
        generationPromptPackage: input.generationPromptPackage,
        generationMode: input.generationMode,
        generationSemanticContext: input.generationSemanticContext,
        generatedDraft: input.generatedDraft,
        runtimeSchema: input.runtimeSchema,
        actions: input.sqlCopilotStateActions,
        settingsActions: input.sqlCopilotSettingsStateActions,
        saveSettings: desktopBridge.settings.update,
        updateSettingsCacheAndInvalidate: () => invalidateSettingsQuery(input.queryClient),
        refetchRuntime: input.refetchSqlCopilotRuntime,
        runProbe: input.runSqlCopilotProbe,
        showNotification: input.showNotification,
        insertSqlIntoActiveTab: input.insertSqlIntoActiveTab,
        openSqlInNewTab: input.openSqlInNewTab,
        focusSqlEditor: input.focusSqlEditor,
        executeScript: input.executeScript,
        executeStatement: input.executeStatement,
      }),
    [
      input.effectiveSettings,
      input.executeScript,
      input.executeStatement,
      input.focusSqlEditor,
      input.generatedDraft,
      input.generationMode,
      input.generationPromptPackage,
      input.generationSemanticContext,
      input.insertSqlIntoActiveTab,
      input.openSqlInNewTab,
      input.promptPackage,
      input.queryClient,
      input.refetchSqlCopilotRuntime,
      input.runSqlCopilotProbe,
      input.runtimeSchema,
      input.showNotification,
      input.sqlCopilotSettingsDirty,
      input.sqlCopilotSettingsStateActions,
      input.sqlCopilotStateActions,
    ],
  );

  return {
    handleOpenSqlLibrary,
    handleOpenSqlMemory,
    handleClearAllSqlMemory: sqlMemoryController.handleClearAllSqlMemory,
    handleClearSqlMemoryCategory: sqlMemoryController.handleClearSqlMemoryCategory,
    handleClearSqlMemoryCurrentSchema: sqlMemoryController.handleClearSqlMemoryCurrentSchema,
    handleCompletionAccepted: sqlMemoryController.handleCompletionAccepted,
    handleSqlMemoryRetentionChange: sqlMemoryController.handleSqlMemoryRetentionChange,
    handleCancelSaveSnippet: sqlLibraryController.handleCancelSaveSnippet,
    handleConfirmSaveSnippet: sqlLibraryController.handleConfirmSaveSnippet,
    handleDeleteSnippetFromLibrary: sqlLibraryController.handleDeleteSnippetFromLibrary,
    handleOpenSqlFromLibraryInNewTab: sqlLibraryController.handleOpenSqlFromLibraryInNewTab,
    handleReplaceSqlFromLibrary: sqlLibraryController.handleReplaceSqlFromLibrary,
    handleSaveSnippet: sqlLibraryController.handleSaveSnippet,
    handleGenerateSqlCopilotDraft: sqlCopilotController.handleGenerateSqlCopilotDraft,
    handleOpenGeneratedDraftInNewTab: sqlCopilotController.handleOpenGeneratedDraftInNewTab,
    handleOpenSqlCopilot: sqlCopilotController.handleOpenSqlCopilot,
    handleReplaceActiveTabWithGeneratedDraft:
      sqlCopilotController.handleReplaceActiveTabWithGeneratedDraft,
    handleRunGeneratedDraftWithSafetyGates:
      sqlCopilotController.handleRunGeneratedDraftWithSafetyGates,
    handleRunGroundedSqlCopilotProbe: sqlCopilotController.handleRunGroundedSqlCopilotProbe,
    handleSaveSqlCopilotSettings: sqlCopilotController.handleSaveSqlCopilotSettings,
    handleSqlCopilotSettingChange: sqlCopilotController.handleSqlCopilotSettingChange,
    handleWarmSqlCopilotRuntime: sqlCopilotController.handleWarmSqlCopilotRuntime,
  };
}
