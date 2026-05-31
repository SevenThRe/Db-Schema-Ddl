import test from "node:test";
import assert from "node:assert/strict";
import type { DbSqlCopilotProbeResponse } from "../../shared/schema";
import {
  buildEmptyGeneratedSqlDraftNotice,
  buildGeneratedSqlDraftFailure,
  buildGeneratedSqlDraftSuccessNotice,
  buildSqlCopilotProbeFailure,
  buildSqlCopilotProbeSuccessNotice,
  buildSqlCopilotSettingsFailureNotice,
  buildSqlCopilotSettingsSavedNotice,
  getSqlCopilotRuntimeGateNotice,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-runtime";

const response: DbSqlCopilotProbeResponse = {
  provider: "ollama",
  modelId: "qwen",
  outputText: "{}",
  latencyMs: 42,
  promptCharCount: 10,
  completionCharCount: 2,
  executedAt: "2026-05-31T00:00:00.000Z",
  offline: true,
  warnings: [],
};

test("sql copilot runtime gates dirty settings and disabled runtime by action", () => {
  assert.deepEqual(
    getSqlCopilotRuntimeGateNotice({
      settingsDirty: true,
      runtimeEnabled: true,
      action: "probe",
    }),
    {
      title: "Save runtime settings first",
      description:
        "Persist local provider changes before probing so backend runtime state and prompt grounding stay aligned.",
      variant: "default",
    },
  );
  assert.deepEqual(
    getSqlCopilotRuntimeGateNotice({
      settingsDirty: false,
      runtimeEnabled: false,
      action: "generate",
    }),
    {
      title: "SQL copilot runtime is disabled",
      description: "Enable the local runtime before generating SQL drafts.",
      variant: "default",
    },
  );
  assert.equal(
    getSqlCopilotRuntimeGateNotice({
      settingsDirty: false,
      runtimeEnabled: true,
      action: "generate",
    }),
    null,
  );
});

test("sql copilot runtime centralizes settings and probe notices", () => {
  assert.deepEqual(buildSqlCopilotSettingsSavedNotice(), {
    title: "SQL copilot settings saved",
    description: "Local runtime configuration was updated for this workstation.",
    variant: "success",
  });
  assert.deepEqual(buildSqlCopilotSettingsFailureNotice(new Error("save failed")), {
    title: "Failed to save SQL copilot settings",
    description: "save failed",
    variant: "destructive",
  });
  assert.deepEqual(
    buildSqlCopilotProbeSuccessNotice({ response, warmupOnly: false }),
    {
      title: "Grounded probe completed",
      description: "ollama responded locally in 42 ms.",
      variant: "success",
    },
  );
  assert.deepEqual(buildSqlCopilotProbeFailure(new Error("probe failed")), {
    message: "probe failed",
    notice: {
      title: "SQL copilot probe failed",
      description: "probe failed",
      variant: "destructive",
    },
  });
});

test("sql copilot runtime centralizes generated draft notices", () => {
  assert.deepEqual(
    buildEmptyGeneratedSqlDraftNotice({
      assumptions: ["need table"],
      safetyNotes: ["fallback"],
    }),
    {
      message: "need table",
      notice: {
        title: "Generated draft needs review",
        description: "need table",
        variant: "default",
      },
    },
  );
  assert.deepEqual(
    buildGeneratedSqlDraftSuccessNotice({
      response,
      draft: {
        hallucinationRisk: true,
        safetyRegression: false,
      },
    }),
    {
      title: "Generated SQL draft ready",
      description:
        "ollama responded locally in 42 ms. Semantic diagnostics flagged possible grounding issues.",
      variant: "default",
    },
  );
  assert.deepEqual(buildGeneratedSqlDraftFailure(new Error("generate failed")), {
    message: "generate failed",
    notice: {
      title: "SQL draft generation failed",
      description: "generate failed",
      variant: "destructive",
    },
  });
});
