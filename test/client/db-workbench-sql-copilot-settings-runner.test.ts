import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultDdlSettings } from "../../shared/config";
import {
  createSqlCopilotSettingsStateActions,
  SETTINGS_QUERY_KEY,
  runSaveSqlCopilotSettings,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-settings-runner";
import type { DdlSettings } from "../../shared/schema";

function settings(overrides: Partial<DdlSettings> = {}): DdlSettings {
  return {
    ...createDefaultDdlSettings(),
    ...overrides,
  };
}

test("sql copilot settings runner saves, refreshes cache, and notifies", async () => {
  const events: string[] = [];
  const requested: DdlSettings[] = [];
  const saved = settings({
    sqlCopilotEnabled: true,
    sqlCopilotProvider: "ollama",
    sqlCopilotOllamaModel: " qwen3 ",
  });

  const result = await runSaveSqlCopilotSettings({
    settings: saved,
    saveSettings: async (nextSettings) => {
      requested.push(nextSettings);
      return saved;
    },
    beginSave: () => events.push("begin"),
    applySettingsDraft: (draft) => events.push(`draft:${draft.sqlCopilotOllamaModel ?? "none"}`),
    updateSettingsCache: (nextSettings) => events.push(`cache:${nextSettings.sqlCopilotProvider}`),
    invalidateSettings: async () => events.push("invalidate"),
    refetchRuntime: async () => events.push("runtime"),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.variant}`),
    finishSave: () => events.push("finish"),
  });

  assert.equal(result, saved);
  assert.deepEqual(requested, [saved]);
  assert.deepEqual(events, [
    "begin",
    "draft:qwen3",
    "cache:ollama",
    "invalidate",
    "runtime",
    "notice:SQL copilot settings saved:success",
    "finish",
  ]);
});

test("sql copilot settings runner reports save failures and finalizes", async () => {
  const events: string[] = [];

  const result = await runSaveSqlCopilotSettings({
    settings: settings(),
    saveSettings: async () => {
      throw new Error("settings store unavailable");
    },
    beginSave: () => events.push("begin"),
    applySettingsDraft: () => assert.fail("failed save should not apply settings draft"),
    updateSettingsCache: () => assert.fail("failed save should not update cache"),
    invalidateSettings: async () => assert.fail("failed save should not invalidate settings"),
    refetchRuntime: async () => assert.fail("failed save should not refetch runtime"),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.description}`),
    finishSave: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "begin",
    "notice:Failed to save SQL copilot settings:settings store unavailable",
    "finish",
  ]);
});

test("sql copilot settings runner creates reusable state action objects", () => {
  const events: string[] = [];
  const saved = settings({
    sqlCopilotEnabled: true,
    sqlCopilotProvider: "ollama",
    sqlCopilotOllamaModel: "qwen3",
  });
  const actions = createSqlCopilotSettingsStateActions({
    setIsSaving: (isSaving) => events.push(`saving:${isSaving}`),
    setSettingsDraft: (draft) => events.push(`draft:${draft.sqlCopilotOllamaModel ?? "none"}`),
    updateSettingsDraft: (updater) => {
      const updated = updater({
        sqlCopilotEnabled: false,
        sqlCopilotProvider: "none",
        sqlCopilotOllamaBaseUrl: "",
        sqlCopilotOllamaModel: "",
        sqlCopilotLlamaCliPath: "",
        sqlCopilotLlamaModelPath: "",
      });
      events.push(`update:${updated.sqlCopilotProvider}:${updated.sqlCopilotOllamaModel ?? "none"}`);
    },
    settingsCache: {
      setQueryData: (queryKey, nextSettings) => {
        events.push(`cache:${queryKey.join("/")}:${nextSettings.sqlCopilotProvider}`);
      },
    },
  });

  actions.beginSave();
  actions.applySettingsDraft({
    sqlCopilotEnabled: true,
    sqlCopilotProvider: "ollama",
    sqlCopilotOllamaBaseUrl: "http://localhost:11434",
    sqlCopilotOllamaModel: "qwen3",
    sqlCopilotLlamaCliPath: "",
    sqlCopilotLlamaModelPath: "",
  });
  actions.updateSetting("sqlCopilotProvider", "ollama");
  actions.updateSettingsCache(saved);
  actions.finishSave();

  assert.deepEqual(events, [
    "saving:true",
    "draft:qwen3",
    "update:ollama:",
    "cache:/api/settings:ollama",
    "saving:false",
  ]);
});

test("sql copilot settings runner owns the settings query cache key", () => {
  assert.deepEqual(SETTINGS_QUERY_KEY, ["/api/settings"]);
});
