import { createDefaultDdlSettings } from "@shared/config";
import type { DdlSettings } from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";

export function normalizeOptionalSqlCopilotSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function pickSqlCopilotSettings(settings: DdlSettings): SqlCopilotSettingsDraft {
  return {
    sqlCopilotEnabled: settings.sqlCopilotEnabled,
    sqlCopilotProvider: settings.sqlCopilotProvider,
    sqlCopilotOllamaBaseUrl: settings.sqlCopilotOllamaBaseUrl,
    sqlCopilotOllamaModel: normalizeOptionalSqlCopilotSetting(settings.sqlCopilotOllamaModel),
    sqlCopilotLlamaCliPath: normalizeOptionalSqlCopilotSetting(settings.sqlCopilotLlamaCliPath),
    sqlCopilotLlamaModelPath: normalizeOptionalSqlCopilotSetting(settings.sqlCopilotLlamaModelPath),
    sqlCopilotMaxOutputTokens: settings.sqlCopilotMaxOutputTokens,
    sqlCopilotTemperature: settings.sqlCopilotTemperature,
    sqlCopilotGroundingMaxTables: settings.sqlCopilotGroundingMaxTables,
    sqlCopilotGroundingMaxPatterns: settings.sqlCopilotGroundingMaxPatterns,
    sqlCopilotGroundingMaxValueProfiles: settings.sqlCopilotGroundingMaxValueProfiles,
    sqlCopilotRequestTimeoutMs: settings.sqlCopilotRequestTimeoutMs,
  };
}

export function mergeSqlCopilotSettings(
  settings: DdlSettings,
  draft: SqlCopilotSettingsDraft,
): DdlSettings {
  return {
    ...settings,
    ...draft,
    sqlCopilotOllamaModel: normalizeOptionalSqlCopilotSetting(draft.sqlCopilotOllamaModel),
    sqlCopilotLlamaCliPath: normalizeOptionalSqlCopilotSetting(draft.sqlCopilotLlamaCliPath),
    sqlCopilotLlamaModelPath: normalizeOptionalSqlCopilotSetting(draft.sqlCopilotLlamaModelPath),
  };
}

export function sqlCopilotSettingsEqual(
  left: SqlCopilotSettingsDraft,
  right: SqlCopilotSettingsDraft,
): boolean {
  return JSON.stringify(mergeSqlCopilotSettings(createDefaultDdlSettings(), left)) ===
    JSON.stringify(mergeSqlCopilotSettings(createDefaultDdlSettings(), right));
}
