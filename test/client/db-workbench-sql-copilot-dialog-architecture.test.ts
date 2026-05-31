import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  formatSqlCopilotRuntimeStatus,
  isSqlCopilotRuntimeActionDisabled,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-dialog-model";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql copilot dialog keeps shell thin and delegates runtime UI to sections", async () => {
  const dialog = await read(
    "client/src/components/extensions/db-workbench/SqlCopilotDialog.tsx",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-dialog-sections.tsx",
  );
  const mainPanel = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-dialog-main-panel.tsx",
  );
  const model = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-dialog-model.ts",
  );

  assert.match(dialog, /<Dialog /);
  assert.match(dialog, /<DialogContent/);
  assert.match(dialog, /<SqlCopilotDialogContent/);
  assert.doesNotMatch(dialog, /Generate SQL draft/);
  assert.doesNotMatch(dialog, /Generated SQL prompt preview/);
  assert.doesNotMatch(dialog, /Latest model output/);
  assert.doesNotMatch(dialog, /SqlCopilotRuntimeSidebar/);

  // The sections file is the dialog shell: header, runtime status bar, sidebar,
  // and main-panel composition. Prompt-authoring markup lives in the main panel.
  assert.match(sections, /<SqlCopilotRuntimeSidebar/);
  assert.match(sections, /<SqlCopilotMainPanel/);
  assert.match(sections, /offline_local_only/);
  assert.doesNotMatch(sections, /Generate SQL draft/);
  assert.doesNotMatch(sections, /Latest model output/);

  // The main panel owns the prompt controls, prompt preview, and model output.
  assert.match(mainPanel, /export function SqlCopilotMainPanel/);
  assert.match(mainPanel, /<SqlCopilotGeneratedDraftReview/);
  assert.match(mainPanel, /Generate SQL draft/);
  assert.match(mainPanel, /Generated SQL prompt preview/);
  assert.match(mainPanel, /Latest model output/);

  assert.match(model, /isSqlCopilotRuntimeActionDisabled/);
  assert.match(model, /formatSqlCopilotRuntimeStatus/);
});

test("sql copilot dialog model preserves safe runtime action gates", () => {
  assert.equal(
    isSqlCopilotRuntimeActionDisabled({
      enabled: true,
      isRunningProbe: false,
      isGeneratingDraft: false,
      hasUnsavedSettings: false,
    }),
    false,
  );
  assert.equal(
    isSqlCopilotRuntimeActionDisabled({
      enabled: false,
      isRunningProbe: false,
      isGeneratingDraft: false,
      hasUnsavedSettings: false,
    }),
    true,
  );
  assert.equal(
    isSqlCopilotRuntimeActionDisabled({
      enabled: true,
      isRunningProbe: true,
      isGeneratingDraft: false,
      hasUnsavedSettings: false,
    }),
    true,
  );
  assert.equal(
    isSqlCopilotRuntimeActionDisabled({
      enabled: true,
      isRunningProbe: false,
      isGeneratingDraft: true,
      hasUnsavedSettings: false,
    }),
    true,
  );
  assert.equal(
    isSqlCopilotRuntimeActionDisabled({
      enabled: true,
      isRunningProbe: false,
      isGeneratingDraft: false,
      hasUnsavedSettings: true,
    }),
    true,
  );

  assert.equal(
    formatSqlCopilotRuntimeStatus({
      runtimeLoading: true,
      runtimeError: "offline",
      statusSummary: "ready",
    }),
    "Refreshing local runtime availability...",
  );
  assert.equal(
    formatSqlCopilotRuntimeStatus({
      runtimeLoading: false,
      runtimeError: "offline",
      statusSummary: "ready",
    }),
    "offline",
  );
  assert.equal(
    formatSqlCopilotRuntimeStatus({
      runtimeLoading: false,
      runtimeError: null,
      statusSummary: "ready",
    }),
    "ready",
  );
});
