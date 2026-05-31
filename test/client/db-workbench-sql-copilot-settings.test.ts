import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDdlSettings } from "../../shared/config";
import {
  mergeSqlCopilotSettings,
  normalizeOptionalSqlCopilotSetting,
  pickSqlCopilotSettings,
  sqlCopilotSettingsEqual,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-settings";

test("sql copilot settings normalize optional path and model values", () => {
  assert.equal(normalizeOptionalSqlCopilotSetting("  qwen2.5-coder  "), "qwen2.5-coder");
  assert.equal(normalizeOptionalSqlCopilotSetting("   "), undefined);
  assert.equal(normalizeOptionalSqlCopilotSetting(undefined), undefined);
});

test("sql copilot settings pick a dialog draft from ddl settings", () => {
  const settings = {
    ...createDefaultDdlSettings(),
    sqlCopilotEnabled: true,
    sqlCopilotProvider: "llama_cpp_cli" as const,
    sqlCopilotOllamaModel: "  ignored-model  ",
    sqlCopilotLlamaCliPath: "  C:/llama/llama-cli.exe  ",
    sqlCopilotLlamaModelPath: "  C:/models/sql.gguf  ",
  };

  const draft = pickSqlCopilotSettings(settings);

  assert.equal(draft.sqlCopilotEnabled, true);
  assert.equal(draft.sqlCopilotProvider, "llama_cpp_cli");
  assert.equal(draft.sqlCopilotOllamaModel, "ignored-model");
  assert.equal(draft.sqlCopilotLlamaCliPath, "C:/llama/llama-cli.exe");
  assert.equal(draft.sqlCopilotLlamaModelPath, "C:/models/sql.gguf");
});

test("sql copilot settings merge trims optional values before persistence", () => {
  const base = createDefaultDdlSettings();
  const merged = mergeSqlCopilotSettings(base, {
    ...pickSqlCopilotSettings(base),
    sqlCopilotOllamaModel: "  codellama:7b  ",
    sqlCopilotLlamaCliPath: "   ",
    sqlCopilotLlamaModelPath: " C:/models/db.gguf ",
  });

  assert.equal(merged.sqlCopilotOllamaModel, "codellama:7b");
  assert.equal(merged.sqlCopilotLlamaCliPath, undefined);
  assert.equal(merged.sqlCopilotLlamaModelPath, "C:/models/db.gguf");
});

test("sql copilot settings equality ignores whitespace-only optional differences", () => {
  const base = pickSqlCopilotSettings(createDefaultDdlSettings());

  assert.equal(
    sqlCopilotSettingsEqual(
      { ...base, sqlCopilotOllamaModel: undefined },
      { ...base, sqlCopilotOllamaModel: "   " },
    ),
    true,
  );
  assert.equal(
    sqlCopilotSettingsEqual(
      { ...base, sqlCopilotMaxOutputTokens: 512 },
      { ...base, sqlCopilotMaxOutputTokens: 1024 },
    ),
    false,
  );
});
