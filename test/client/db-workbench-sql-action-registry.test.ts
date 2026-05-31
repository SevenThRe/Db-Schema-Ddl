import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultDdlSettings } from "../../shared/config";
import { createEmptySqlWorkbenchMemory } from "../../client/src/components/extensions/db-workbench/sql-memory";
import { createWorkbenchSqlStateActions } from "../../client/src/components/extensions/db-workbench/workbench-sql-action-registry";

test("workbench sql action registry creates grouped action objects", () => {
  const events: string[] = [];
  const actions = createWorkbenchSqlStateActions({
    setSqlCopilotOpen: (open) => events.push(`copilot-open:${open}`),
    setIsRunningSqlCopilotProbe: (isRunning) => events.push(`probe-running:${isRunning}`),
    setSqlCopilotProbeError: (message) => events.push(`probe-error:${message ?? "none"}`),
    setSqlCopilotProbeResult: (response) => events.push(`probe-result:${response.provider}`),
    setIsGeneratingSqlCopilotDraft: (isGenerating) => events.push(`draft-running:${isGenerating}`),
    setSqlCopilotGeneratedDraft: (draft) => events.push(`draft:${draft?.sql ?? "none"}`),
    setSqlCopilotGenerationError: (message) => events.push(`draft-error:${message ?? "none"}`),
    setIsSavingSqlCopilotSettings: (isSaving) => events.push(`settings-saving:${isSaving}`),
    setSqlCopilotSettingsDraft: (draft) => events.push(`settings-draft:${draft.sqlCopilotProvider}`),
    updateSqlCopilotSettingsDraft: (updater) => {
      const updated = updater({
        sqlCopilotEnabled: false,
        sqlCopilotProvider: "none",
        sqlCopilotOllamaBaseUrl: "",
        sqlCopilotOllamaModel: "",
        sqlCopilotLlamaCliPath: "",
        sqlCopilotLlamaModelPath: "",
      });
      events.push(`settings-update:${updated.sqlCopilotProvider}`);
    },
    settingsCache: {
      setQueryData: (queryKey, settings) => {
        events.push(`settings-cache:${queryKey.join("/")}:${settings.sqlCopilotProvider}`);
      },
    },
    setSqlMemory: (memory) => events.push(`memory:${memory.queryPatterns.length}`),
    setSqlMemoryOpen: (open) => events.push(`memory-open:${open}`),
    setPendingSnippetName: (name) => events.push(`snippet-name:${name}`),
    setSaveSnippetDialogOpen: (open) => events.push(`snippet-dialog:${open}`),
    setSavedSnippets: (snippets) => events.push(`snippets:${snippets.length}`),
    setSqlLibraryOpen: (open) => events.push(`library-open:${open}`),
    setSqlLibrarySearch: (search) => events.push(`library-search:${search}`),
    setSelectedSqlLibraryEntryId: (entryId) => events.push(`library-entry:${entryId}`),
  });

  actions.copilot.openDialog();
  actions.copilot.beginProbe();
  actions.copilot.setProbeError(null);
  actions.copilotSettings.beginSave();
  actions.copilotSettings.updateSetting("sqlCopilotProvider", "ollama");
  actions.copilotSettings.updateSettingsCache({
    ...createDefaultDdlSettings(),
    sqlCopilotProvider: "ollama",
  });
  actions.memory.openDialog();
  actions.memory.applyMemory(createEmptySqlWorkbenchMemory());
  actions.library.openLibrary("entry-1");
  actions.library.setPendingSnippetName("Daily query");
  actions.library.setSaveDialogOpen(true);

  assert.deepEqual(events, [
    "copilot-open:true",
    "probe-running:true",
    "probe-error:none",
    "settings-saving:true",
    "settings-update:ollama",
    "settings-cache:/api/settings:ollama",
    "memory-open:true",
    "memory:0",
    "library-search:",
    "library-entry:entry-1",
    "library-open:true",
    "snippet-name:Daily query",
    "snippet-dialog:true",
  ]);
});
