import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchConnectionRestoreActions,
  runWorkbenchConnectionRestore,
  type WorkbenchConnectionRestoreActions,
} from "../../client/src/components/extensions/db-workbench/workbench-session-restore-runner";
import type { HydratedConnectionSession } from "../../client/src/components/extensions/db-workbench/workbench-session-hydration";
import { createEmptySqlWorkbenchMemory } from "../../client/src/components/extensions/db-workbench/sql-memory";

function restoredSession(
  overrides: Partial<HydratedConnectionSession> = {},
): HydratedConnectionSession {
  return {
    tabs: [{ id: "tab-1", label: "Query", sql: "select 1", connectionId: "conn-1" }],
    activeTabId: "tab-1",
    recentQueries: ["select 1"],
    queryHistory: [],
    sqlMemory: createEmptySqlWorkbenchMemory(),
    snippets: [],
    selectedTableName: "users",
    activeSchema: "audit",
    lastResultTab: "inspect",
    inspectionTarget: {
      objectKind: "table",
      objectName: "users",
      signature: null,
      parentObjectName: null,
    },
    schemaDiffTargetConnectionId: "conn-2",
    syncSourceConnectionId: "conn-1",
    syncTargetConnectionId: "conn-2",
    selectedJobId: "job-1",
    ...overrides,
  };
}

function actions(events: string[]): WorkbenchConnectionRestoreActions {
  return {
    setTabs: (tabs) => events.push(`tabs:${tabs.length}`),
    setActiveTabId: (tabId) => events.push(`active-tab:${tabId}`),
    setRecentQueries: (queries) => events.push(`recent:${queries.length}`),
    setQueryHistory: (history) => events.push(`history:${history.length}`),
    setSqlMemory: (memory) => events.push(`memory:${memory.queryPatterns.length}`),
    setSavedSnippets: (snippets) => events.push(`snippets:${snippets.length}`),
    setSelectedTableName: (tableName) => events.push(`table:${tableName ?? "none"}`),
    setActiveSchema: (schema) => events.push(`schema:${schema}`),
    setResultTab: (tab) => events.push(`result-tab:${tab}`),
    setRestoredInspectionTarget: (target) => events.push(`inspection:${target?.objectName ?? "none"}`),
    setSqlLibraryOpen: (open) => events.push(`library-open:${open}`),
    setSqlMemoryOpen: (open) => events.push(`memory-open:${open}`),
    setSqlCopilotOpen: (open) => events.push(`copilot-open:${open}`),
    setSqlLibrarySearch: (search) => events.push(`library-search:${search}`),
    setSelectedSqlLibraryEntryId: (entryId) => events.push(`library-entry:${entryId}`),
    setSqlCopilotOperatorPrompt: (prompt) => events.push(`copilot-prompt:${prompt}`),
    setSqlCopilotProbeResult: (result) => events.push(`probe-result:${result?.provider ?? "none"}`),
    setSqlCopilotProbeError: (message) => events.push(`probe-error:${message ?? "none"}`),
    setSqlCopilotGeneratedDraft: (draft) => events.push(`draft:${draft?.sql ?? "none"}`),
    setSqlCopilotGenerationError: (message) => events.push(`generation-error:${message ?? "none"}`),
    setPendingParameterReview: (review) => events.push(`parameter-review:${review ? "set" : "none"}`),
    setParameterValues: (values) => events.push(`parameter-values:${Object.keys(values).length}`),
    setPendingScriptReview: (review) => events.push(`script-review:${review ? "set" : "none"}`),
    setPendingEditCells: (cells) => events.push(`edit-cells:${Object.keys(cells).length}`),
    setPendingDeleteRows: (rows) => events.push(`delete-rows:${Object.keys(rows).length}`),
    setPendingInsertedRows: (rows) => events.push(`inserted-rows:${Object.keys(rows).length}`),
    setPreparedGridPlan: (plan) => events.push(`grid-plan:${plan ? "set" : "none"}`),
    setLastGridEditSource: (source) => events.push(`grid-source:${source?.kind ?? "none"}`),
    setInspectionState: (state) => events.push(`inspection-state:${state.inspection ? "set" : "none"}`),
    setSchemaDiffTargetConnectionId: (connectionId) => events.push(`schema-diff-target:${connectionId}`),
    setSyncSourceConnectionId: (connectionId) => events.push(`sync-source:${connectionId}`),
    setSyncTargetConnectionId: (connectionId) => events.push(`sync-target:${connectionId}`),
    setSelectedJobId: (jobId) => events.push(`job:${jobId ?? "none"}`),
    setSyncSelectedTables: (tables) => events.push(`sync-tables:${tables.length}`),
    setDiffPreview: (preview) => events.push(`diff-preview:${preview ? "set" : "none"}`),
    setDiffDetail: (detail) => events.push(`diff-detail:${detail ? "set" : "none"}`),
    setDiffRows: (rows) => events.push(`diff-rows:${rows.length}`),
    setSelectedDiffRowIndex: (index) => events.push(`diff-index:${index}`),
    setSyncIncludeUnchanged: (includeUnchanged) => events.push(`include-unchanged:${includeUnchanged}`),
    setApplyPreview: (preview) => events.push(`apply-preview:${preview ? "set" : "none"}`),
    setApplyExecute: (execute) => events.push(`apply-execute:${execute ? "set" : "none"}`),
    setApplyJobDetail: (detail) => events.push(`apply-job:${detail ? "set" : "none"}`),
    setApplyProdConfirmation: (confirmation) => events.push(`prod-confirmation:${confirmation}`),
    setApplyUnsafeDeleteConfirmed: (confirmed) => events.push(`unsafe-delete:${confirmed}`),
    setSyncIssue: (message) => events.push(`sync-issue:${message ?? "none"}`),
  };
}

test("session restore runner applies restored connection state and clears transient workbench state", () => {
  const events: string[] = [];
  const restored = restoredSession();

  const result = runWorkbenchConnectionRestore({
    connection: { id: "conn-1", driver: "postgres", defaultSchema: "public" },
    hydrateSession: () => restored,
    actions: actions(events),
  });

  assert.equal(result, restored);
  assert.deepEqual(events.slice(0, 10), [
    "tabs:1",
    "active-tab:tab-1",
    "recent:1",
    "history:0",
    "memory:0",
    "snippets:0",
    "table:users",
    "schema:audit",
    "result-tab:inspect",
    "inspection:users",
  ]);
  assert.ok(events.includes("library-open:false"));
  assert.ok(events.includes("copilot-open:false"));
  assert.ok(events.includes("parameter-review:none"));
  assert.ok(events.includes("edit-cells:0"));
  assert.ok(events.includes("inspection-state:none"));
  assert.ok(events.includes("sync-source:conn-1"));
  assert.ok(events.includes("sync-target:conn-2"));
  assert.ok(events.includes("sync-tables:0"));
  assert.ok(events.includes("apply-preview:none"));
  assert.ok(events.includes("unsafe-delete:false"));
  assert.ok(events.includes("sync-issue:none"));
});

test("session restore runner creates reusable restore action objects", () => {
  const events: string[] = [];
  const restoreActions = createWorkbenchConnectionRestoreActions(actions(events));

  restoreActions.setResultTab("jobs");
  restoreActions.setSyncIssue(null);
  restoreActions.setApplyProdConfirmation("prod");

  assert.deepEqual(events, [
    "result-tab:jobs",
    "sync-issue:none",
    "prod-confirmation:prod",
  ]);
});

test("session restore runner falls non-postgres schema and missing sync targets back safely", () => {
  const events: string[] = [];

  runWorkbenchConnectionRestore({
    connection: { id: "mysql-1", driver: "mysql", defaultSchema: "ignored" },
    hydrateSession: () =>
      restoredSession({
        activeSchema: "tenant",
        schemaDiffTargetConnectionId: null,
        syncSourceConnectionId: null,
        syncTargetConnectionId: null,
        selectedJobId: null,
      }),
    actions: actions(events),
  });

  assert.ok(events.includes("schema:public"));
  assert.ok(events.includes("schema-diff-target:"));
  assert.ok(events.includes("sync-source:mysql-1"));
  assert.ok(events.includes("sync-target:mysql-1"));
  assert.ok(events.includes("job:none"));
});
