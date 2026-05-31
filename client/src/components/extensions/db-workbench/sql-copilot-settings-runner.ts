import type { DdlSettings } from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import {
  buildSqlCopilotSettingsFailureNotice,
  buildSqlCopilotSettingsSavedNotice,
  type SqlCopilotNotice,
} from "./sql-copilot-runtime";
import { pickSqlCopilotSettings } from "./sql-copilot-settings";
import { SETTINGS_QUERY_KEY } from "./workbench-query-cache";

export { SETTINGS_QUERY_KEY };

export interface SettingsQueryCache {
  setQueryData: (queryKey: readonly unknown[], settings: DdlSettings) => unknown;
}

export interface RunSaveSqlCopilotSettingsInput {
  settings: DdlSettings;
  saveSettings: (settings: DdlSettings) => Promise<DdlSettings>;
  beginSave: () => void;
  applySettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
  updateSettingsCache: (settings: DdlSettings) => void;
  invalidateSettings: () => Promise<unknown>;
  refetchRuntime: () => Promise<unknown>;
  showNotification: (notice: SqlCopilotNotice) => void;
  finishSave: () => void;
}

export interface SqlCopilotSettingsStateActions {
  beginSave: () => void;
  applySettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
  updateSetting: <K extends keyof SqlCopilotSettingsDraft>(
    key: K,
    value: SqlCopilotSettingsDraft[K],
  ) => void;
  updateSettingsCache: (settings: DdlSettings) => void;
  finishSave: () => void;
}

export function createSqlCopilotSettingsStateActions(input: {
  setIsSaving: (isSaving: boolean) => void;
  setSettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
  updateSettingsDraft: (
    updater: (current: SqlCopilotSettingsDraft) => SqlCopilotSettingsDraft,
  ) => void;
  settingsCache: SettingsQueryCache;
}): SqlCopilotSettingsStateActions {
  return {
    beginSave: () => input.setIsSaving(true),
    applySettingsDraft: input.setSettingsDraft,
    updateSetting: (key, value) => {
      input.updateSettingsDraft((current) => ({
        ...current,
        [key]: value,
      }));
    },
    updateSettingsCache: (settings) => {
      input.settingsCache.setQueryData(SETTINGS_QUERY_KEY, settings);
    },
    finishSave: () => input.setIsSaving(false),
  };
}

export async function runSaveSqlCopilotSettings(
  input: RunSaveSqlCopilotSettingsInput,
): Promise<DdlSettings | null> {
  input.beginSave();

  try {
    const savedSettings = await input.saveSettings(input.settings);
    input.applySettingsDraft(pickSqlCopilotSettings(savedSettings));
    input.updateSettingsCache(savedSettings);
    await input.invalidateSettings();
    await input.refetchRuntime();
    input.showNotification(buildSqlCopilotSettingsSavedNotice());
    return savedSettings;
  } catch (error) {
    input.showNotification(buildSqlCopilotSettingsFailureNotice(error));
    return null;
  } finally {
    input.finishSave();
  }
}
