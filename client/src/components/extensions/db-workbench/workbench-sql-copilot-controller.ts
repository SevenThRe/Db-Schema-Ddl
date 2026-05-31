import type {
  DbGridEditSource,
  DbSqlCopilotProbeRequest,
  DbSqlCopilotProbeResponse,
  DbSqlCopilotPromptPackage,
  DdlSettings,
} from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import type {
  SqlCopilotGeneratedDraft,
  SqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import {
  openGeneratedDraftInNewTab,
  replaceActiveTabWithGeneratedDraft,
  runGeneratedDraftWithSafetyGates,
} from "./sql-copilot-draft-runner";
import {
  runSqlCopilotGenerateDraft,
  runSqlCopilotProbe,
  type SqlCopilotStateActions,
} from "./sql-copilot-runner";
import {
  runSaveSqlCopilotSettings,
  type SqlCopilotSettingsStateActions,
} from "./sql-copilot-settings-runner";
import type { SqlSemanticContext } from "./sql-semantic-types";

type WorkbenchNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export interface WorkbenchSqlCopilotController {
  handleOpenSqlCopilot: () => void;
  handleSqlCopilotSettingChange: <K extends keyof SqlCopilotSettingsDraft>(
    key: K,
    value: SqlCopilotSettingsDraft[K],
  ) => void;
  handleSaveSqlCopilotSettings: () => Promise<void>;
  handleWarmSqlCopilotRuntime: () => void;
  handleRunGroundedSqlCopilotProbe: () => void;
  handleGenerateSqlCopilotDraft: () => Promise<void>;
  handleReplaceActiveTabWithGeneratedDraft: () => void;
  handleOpenGeneratedDraftInNewTab: () => void;
  handleRunGeneratedDraftWithSafetyGates: () => Promise<void>;
}

export function createWorkbenchSqlCopilotController(input: {
  effectiveSettings: DdlSettings;
  settingsDirty: boolean;
  promptPackage: DbSqlCopilotPromptPackage;
  generationPromptPackage: DbSqlCopilotPromptPackage;
  generationMode: SqlCopilotGenerationMode;
  generationSemanticContext: SqlSemanticContext | null;
  generatedDraft: SqlCopilotGeneratedDraft | null;
  runtimeSchema?: string;
  actions: SqlCopilotStateActions;
  settingsActions: SqlCopilotSettingsStateActions;
  saveSettings: (settings: DdlSettings) => Promise<DdlSettings>;
  updateSettingsCacheAndInvalidate: () => Promise<unknown>;
  refetchRuntime: () => Promise<unknown>;
  runProbe: (
    request: DbSqlCopilotProbeRequest,
  ) => Promise<DbSqlCopilotProbeResponse>;
  showNotification: (notice: WorkbenchNotice) => void;
  insertSqlIntoActiveTab: (sql: string) => void;
  openSqlInNewTab: (sql: string, label: string) => void;
  focusSqlEditor: () => void;
  executeScript: (sql: string) => Promise<unknown>;
  executeStatement: (
    sql: string,
    source: DbGridEditSource,
    mode: "statement",
    cursorOffset?: number,
  ) => Promise<unknown>;
}): WorkbenchSqlCopilotController {
  const handleRunSqlCopilotProbe = async (warmupOnly: boolean) => {
    await runSqlCopilotProbe({
      settingsDirty: input.settingsDirty,
      runtimeEnabled: input.effectiveSettings.sqlCopilotEnabled,
      promptPackage: input.promptPackage,
      warmupOnly,
      runProbe: input.runProbe,
      beginProbe: input.actions.beginProbe,
      setProbeError: input.actions.setProbeError,
      applyProbeResult: input.actions.applyProbeResult,
      refetchRuntime: input.refetchRuntime,
      showNotification: input.showNotification,
      finishProbe: input.actions.finishProbe,
    });
  };

  return {
    handleOpenSqlCopilot: input.actions.openDialog,
    handleSqlCopilotSettingChange: (key, value) => {
      input.settingsActions.updateSetting(key, value);
    },
    handleSaveSqlCopilotSettings: async () => {
      await runSaveSqlCopilotSettings({
        settings: input.effectiveSettings,
        saveSettings: input.saveSettings,
        beginSave: input.settingsActions.beginSave,
        applySettingsDraft: input.settingsActions.applySettingsDraft,
        updateSettingsCache: input.settingsActions.updateSettingsCache,
        invalidateSettings: input.updateSettingsCacheAndInvalidate,
        refetchRuntime: input.refetchRuntime,
        showNotification: input.showNotification,
        finishSave: input.settingsActions.finishSave,
      });
    },
    handleWarmSqlCopilotRuntime: () => {
      void handleRunSqlCopilotProbe(true);
    },
    handleRunGroundedSqlCopilotProbe: () => {
      void handleRunSqlCopilotProbe(false);
    },
    handleGenerateSqlCopilotDraft: async () => {
      await runSqlCopilotGenerateDraft({
        settingsDirty: input.settingsDirty,
        runtimeEnabled: input.effectiveSettings.sqlCopilotEnabled,
        promptPackage: input.generationPromptPackage,
        generationMode: input.generationMode,
        semanticContext: input.generationSemanticContext,
        runProbe: input.runProbe,
        beginGenerate: input.actions.beginGenerate,
        applyGeneratedDraft: input.actions.applyGeneratedDraft,
        setGenerationError: input.actions.setGenerationError,
        setProbeError: input.actions.setProbeError,
        applyProbeResult: input.actions.applyProbeResult,
        refetchRuntime: input.refetchRuntime,
        showNotification: input.showNotification,
        finishGenerate: input.actions.finishGenerate,
      });
    },
    handleReplaceActiveTabWithGeneratedDraft: () => {
      replaceActiveTabWithGeneratedDraft({
        draft: input.generatedDraft,
        insertSqlIntoActiveTab: input.insertSqlIntoActiveTab,
        focusSqlEditor: input.focusSqlEditor,
        showNotification: input.showNotification,
      });
    },
    handleOpenGeneratedDraftInNewTab: () => {
      openGeneratedDraftInNewTab({
        draft: input.generatedDraft,
        openSqlInNewTab: input.openSqlInNewTab,
        showNotification: input.showNotification,
      });
    },
    handleRunGeneratedDraftWithSafetyGates: async () => {
      await runGeneratedDraftWithSafetyGates({
        draft: input.generatedDraft,
        runtimeSchema: input.runtimeSchema,
        executeScript: input.executeScript,
        executeStatement: input.executeStatement,
      });
    },
  };
}
