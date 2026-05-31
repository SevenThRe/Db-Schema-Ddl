import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultDdlSettings } from "../../shared/config";
import type {
  DbSqlCopilotProbeRequest,
  DbSqlCopilotProbeResponse,
  DbSqlCopilotPromptPackage,
} from "../../shared/schema";
import type { SqlCopilotGeneratedDraft } from "../../client/src/components/extensions/db-workbench/sql-copilot-generation";
import {
  createWorkbenchSqlCopilotController,
} from "../../client/src/components/extensions/db-workbench/workbench-sql-copilot-controller";

function promptPackage(userPrompt = "user"): DbSqlCopilotPromptPackage {
  return {
    provider: "ollama",
    systemPrompt: "system",
    userPrompt,
    sections: [],
    promptPreview: `system\n${userPrompt}`,
    groundingSummary: {
      driver: "postgres",
      activeSchema: "public",
      sectionCount: 0,
      relationCount: 0,
      memoryPatternCount: 0,
      valueProfileCount: 0,
      promptCharCount: userPrompt.length,
    },
  };
}

function probeResponse(outputText = `{
  "sql": "select id from users",
  "summary": "List users",
  "assumptions": [],
  "safetyNotes": []
}`): DbSqlCopilotProbeResponse {
  return {
    provider: "ollama",
    modelId: "qwen",
    outputText,
    latencyMs: 42,
    promptCharCount: 10,
    completionCharCount: 8,
    executedAt: "2026-05-31T00:00:00.000Z",
    offline: true,
    warnings: [],
  };
}

test("workbench sql copilot controller centralizes settings, probe, generation, and draft commands", async () => {
  const events: string[] = [];
  const requests: DbSqlCopilotProbeRequest[] = [];
  let generatedDraft: SqlCopilotGeneratedDraft | null = {
    sql: "select id from users",
    summary: "List users",
    assumptions: [],
    safetyNotes: [],
    completionMode: "natural_language",
    diagnostics: [],
    hallucinationRisk: false,
    safetyRegression: false,
    rawOutput: "",
  };

  const settings = {
    ...createDefaultDdlSettings(),
    sqlCopilotEnabled: true,
  };

  const controller = createWorkbenchSqlCopilotController({
    effectiveSettings: settings,
    settingsDirty: false,
    promptPackage: promptPackage("probe"),
    generationPromptPackage: promptPackage("generate"),
    generationMode: "natural_language",
    generationSemanticContext: null,
    generatedDraft,
    runtimeSchema: "public",
    actions: {
      openDialog: () => events.push("open"),
      closeDialog: () => events.push("close"),
      beginProbe: () => events.push("probe:begin"),
      setProbeError: (message) => events.push(`probe:error:${message ?? "none"}`),
      applyProbeResult: (response) => events.push(`probe:result:${response.provider}`),
      finishProbe: () => events.push("probe:finish"),
      beginGenerate: () => events.push("generate:begin"),
      applyGeneratedDraft: (draft) => {
        generatedDraft = draft;
        events.push(`generate:draft:${draft?.sql ?? "none"}`);
      },
      setGenerationError: (message) => events.push(`generate:error:${message ?? "none"}`),
      finishGenerate: () => events.push("generate:finish"),
    },
    settingsActions: {
      beginSave: () => events.push("save:begin"),
      applySettingsDraft: (draft) => events.push(`save:draft:${draft.sqlCopilotProvider}`),
      updateSetting: (key, value) => events.push(`setting:${String(key)}:${String(value)}`),
      updateSettingsCache: (saved) => events.push(`save:cache:${saved.sqlCopilotProvider}`),
      finishSave: () => events.push("save:finish"),
    },
    saveSettings: async (nextSettings) => {
      events.push(`save:backend:${nextSettings.sqlCopilotProvider}`);
      return nextSettings;
    },
    updateSettingsCacheAndInvalidate: async () => events.push("settings:invalidate"),
    refetchRuntime: async () => events.push("runtime:refetch"),
    runProbe: async (request) => {
      requests.push(request);
      return probeResponse();
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    insertSqlIntoActiveTab: (sql) => events.push(`insert:${sql}`),
    openSqlInNewTab: (sql, label) => events.push(`newTab:${label}:${sql}`),
    focusSqlEditor: () => events.push("focus"),
    executeScript: async (sql) => events.push(`script:${sql}`),
    executeStatement: async (sql, source) =>
      events.push(`statement:${source.kind}:${source.schema ?? "none"}:${sql}`),
  });

  controller.handleOpenSqlCopilot();
  controller.handleSqlCopilotSettingChange("sqlCopilotOllamaModel", "qwen");
  await controller.handleSaveSqlCopilotSettings();
  controller.handleWarmSqlCopilotRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.handleRunGroundedSqlCopilotProbe();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.handleGenerateSqlCopilotDraft();
  controller.handleReplaceActiveTabWithGeneratedDraft();
  controller.handleOpenGeneratedDraftInNewTab();
  await controller.handleRunGeneratedDraftWithSafetyGates();

  assert.deepEqual(
    requests.map((request) => request.promptPackage.userPrompt),
    ["probe", "probe", "generate"],
  );
  assert.ok(events.includes("open"));
  assert.ok(events.includes("setting:sqlCopilotOllamaModel:qwen"));
  assert.ok(events.includes("save:backend:ollama"));
  assert.ok(events.includes("settings:invalidate"));
  assert.ok(events.includes("notice:SQL copilot warmed up"));
  assert.ok(events.includes("notice:Grounded probe completed"));
  assert.ok(events.includes("notice:Generated SQL draft ready"));
  assert.ok(events.includes("insert:select id from users"));
  assert.ok(events.includes("newTab:List users:select id from users"));
  assert.ok(events.includes("statement:custom-sql:public:select id from users"));
});
