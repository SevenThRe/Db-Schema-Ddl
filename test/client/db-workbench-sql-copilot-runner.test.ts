import test from "node:test";
import assert from "node:assert/strict";

import {
  createSqlCopilotStateActions,
  runSqlCopilotGenerateDraft,
  runSqlCopilotProbe,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-runner";
import type {
  DbSqlCopilotProbeRequest,
  DbSqlCopilotProbeResponse,
  DbSqlCopilotPromptPackage,
} from "../../shared/schema";

function promptPackage(): DbSqlCopilotPromptPackage {
  return {
    provider: "ollama",
    systemPrompt: "system",
    userPrompt: "user",
    sections: [],
    promptPreview: "system\nuser",
    groundingSummary: {
      driver: "postgres",
      activeSchema: "public",
      sectionCount: 0,
      relationCount: 0,
      memoryPatternCount: 0,
      valueProfileCount: 0,
      promptCharCount: 10,
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

test("sql copilot runner gates probe before backend calls", async () => {
  const notices: string[] = [];
  let backendCalls = 0;

  const result = await runSqlCopilotProbe({
    settingsDirty: true,
    runtimeEnabled: true,
    promptPackage: promptPackage(),
    warmupOnly: false,
    runProbe: async () => {
      backendCalls += 1;
      return probeResponse();
    },
    beginProbe: () => assert.fail("probe should not begin"),
    setProbeError: () => assert.fail("probe error should not change"),
    applyProbeResult: () => assert.fail("probe result should not apply"),
    refetchRuntime: async () => assert.fail("runtime should not refetch"),
    showNotification: (notice) => notices.push(notice.title),
    finishProbe: () => assert.fail("probe should not finish"),
  });

  assert.equal(result, null);
  assert.equal(backendCalls, 0);
  assert.deepEqual(notices, ["Save runtime settings first"]);
});

test("sql copilot runner applies successful probe and refreshes runtime", async () => {
  const requests: DbSqlCopilotProbeRequest[] = [];
  const events: string[] = [];
  const response = probeResponse();

  const result = await runSqlCopilotProbe({
    settingsDirty: false,
    runtimeEnabled: true,
    promptPackage: promptPackage(),
    warmupOnly: true,
    runProbe: async (request) => {
      requests.push(request);
      return response;
    },
    beginProbe: () => events.push("begin"),
    setProbeError: (message) => events.push(`error:${message ?? "none"}`),
    applyProbeResult: (applied) => events.push(`result:${applied.provider}`),
    refetchRuntime: async () => events.push("refetch"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishProbe: () => events.push("finish"),
  });

  assert.equal(result, response);
  assert.deepEqual(requests, [
    {
      promptPackage: promptPackage(),
      warmupOnly: true,
    },
  ]);
  assert.deepEqual(events, [
    "begin",
    "error:none",
    "result:ollama",
    "refetch",
    "notice:SQL copilot warmed up",
    "finish",
  ]);
});

test("sql copilot runner reports probe failures with runtime refresh", async () => {
  const events: string[] = [];

  const result = await runSqlCopilotProbe({
    settingsDirty: false,
    runtimeEnabled: true,
    promptPackage: promptPackage(),
    warmupOnly: false,
    runProbe: async () => {
      throw new Error("runtime missing");
    },
    beginProbe: () => events.push("begin"),
    setProbeError: (message) => events.push(`error:${message ?? "none"}`),
    applyProbeResult: () => assert.fail("result should not apply"),
    refetchRuntime: async () => events.push("refetch"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishProbe: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "begin",
    "error:none",
    "error:runtime missing",
    "refetch",
    "notice:SQL copilot probe failed",
    "finish",
  ]);
});

test("sql copilot runner generates and applies a parsed SQL draft", async () => {
  const requests: DbSqlCopilotProbeRequest[] = [];
  const events: string[] = [];

  const result = await runSqlCopilotGenerateDraft({
    settingsDirty: false,
    runtimeEnabled: true,
    promptPackage: promptPackage(),
    generationMode: "natural_language",
    semanticContext: null,
    runProbe: async (request) => {
      requests.push(request);
      return probeResponse();
    },
    beginGenerate: () => events.push("begin"),
    applyGeneratedDraft: (draft) => events.push(`draft:${draft?.sql ?? "none"}`),
    setGenerationError: (message) => events.push(`generation:${message ?? "none"}`),
    setProbeError: (message) => events.push(`probe:${message ?? "none"}`),
    applyProbeResult: (response) => events.push(`result:${response.provider}`),
    refetchRuntime: async () => events.push("refetch"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishGenerate: () => events.push("finish"),
  });

  assert.equal(result?.sql, "select id from users");
  assert.deepEqual(requests, [{ promptPackage: promptPackage() }]);
  assert.deepEqual(events, [
    "begin",
    "draft:none",
    "generation:none",
    "probe:none",
    "result:ollama",
    "draft:select id from users",
    "refetch",
    "notice:Generated SQL draft ready",
    "finish",
  ]);
});

test("sql copilot runner keeps empty generated SQL behind review notice", async () => {
  const events: string[] = [];

  const result = await runSqlCopilotGenerateDraft({
    settingsDirty: false,
    runtimeEnabled: true,
    promptPackage: promptPackage(),
    generationMode: "intent_refinement",
    semanticContext: null,
    runProbe: async () =>
      probeResponse(`{
        "sql": "",
        "summary": "No draft",
        "assumptions": ["need table selection"],
        "safetyNotes": []
      }`),
    beginGenerate: () => events.push("begin"),
    applyGeneratedDraft: (draft) => events.push(`draft:${draft?.sql ?? "none"}`),
    setGenerationError: (message) => events.push(`generation:${message ?? "none"}`),
    setProbeError: (message) => events.push(`probe:${message ?? "none"}`),
    applyProbeResult: (response) => events.push(`result:${response.provider}`),
    refetchRuntime: async () => events.push("refetch"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishGenerate: () => events.push("finish"),
  });

  assert.equal(result?.sql, "");
  assert.deepEqual(events, [
    "begin",
    "draft:none",
    "generation:none",
    "probe:none",
    "result:ollama",
    "draft:",
    "refetch",
    "generation:need table selection",
    "notice:Generated draft needs review",
    "finish",
  ]);
});

test("sql copilot runner reports generation failures on both draft and probe state", async () => {
  const events: string[] = [];

  const result = await runSqlCopilotGenerateDraft({
    settingsDirty: false,
    runtimeEnabled: true,
    promptPackage: promptPackage(),
    generationMode: "partial_sql_completion",
    semanticContext: null,
    runProbe: async () => {
      throw new Error("model timeout");
    },
    beginGenerate: () => events.push("begin"),
    applyGeneratedDraft: (draft) => events.push(`draft:${draft?.sql ?? "none"}`),
    setGenerationError: (message) => events.push(`generation:${message ?? "none"}`),
    setProbeError: (message) => events.push(`probe:${message ?? "none"}`),
    applyProbeResult: () => assert.fail("probe result should not apply"),
    refetchRuntime: async () => events.push("refetch"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishGenerate: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "begin",
    "draft:none",
    "generation:none",
    "probe:none",
    "generation:model timeout",
    "probe:model timeout",
    "refetch",
    "notice:SQL draft generation failed",
    "finish",
  ]);
});

test("sql copilot runner creates reusable state action objects", () => {
  const events: string[] = [];
  const response = probeResponse();
  const actions = createSqlCopilotStateActions({
    setDialogOpen: (open) => events.push(`dialog:${open}`),
    setIsRunningProbe: (isRunning) => events.push(`probe-running:${isRunning}`),
    setProbeError: (message) => events.push(`probe-error:${message ?? "none"}`),
    setProbeResult: (applied) => events.push(`probe-result:${applied.provider}`),
    setIsGeneratingDraft: (isGenerating) => events.push(`generating:${isGenerating}`),
    setGeneratedDraft: (draft) => events.push(`draft:${draft?.sql ?? "none"}`),
    setGenerationError: (message) => events.push(`generation-error:${message ?? "none"}`),
  });

  actions.openDialog();
  actions.beginProbe();
  actions.setProbeError(null);
  actions.applyProbeResult(response);
  actions.finishProbe();
  actions.beginGenerate();
  actions.applyGeneratedDraft({
    sql: "select id from users",
    summary: "List users",
    assumptions: [],
    safetyNotes: [],
    confidence: "medium",
    diagnostics: [],
  });
  actions.setGenerationError("needs review");
  actions.finishGenerate();
  actions.closeDialog();

  assert.deepEqual(events, [
    "dialog:true",
    "probe-running:true",
    "probe-error:none",
    "probe-result:ollama",
    "probe-running:false",
    "generating:true",
    "draft:select id from users",
    "generation-error:needs review",
    "generating:false",
    "dialog:false",
  ]);
});
