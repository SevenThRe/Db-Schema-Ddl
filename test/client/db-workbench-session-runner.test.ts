import test from "node:test";
import assert from "node:assert/strict";
import type { SetStateAction } from "react";
import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";
import {
  runPersistWorkbenchSession,
  runRepairActiveQueryTabSelection,
} from "../../client/src/components/extensions/db-workbench/workbench-session-runner";
import type { WorkbenchSessionState } from "../../client/src/components/extensions/db-workbench/workbench-session";
import { createEmptySqlWorkbenchMemory } from "../../client/src/components/extensions/db-workbench/sql-memory";

function tab(id: string, connectionId = "old"): QueryTab {
  return {
    id,
    label: id,
    sql: `select '${id}'`,
    connectionId,
  };
}

function createTabHarness(initialTabs: QueryTab[], initialActiveTabId: string) {
  let tabs = initialTabs;
  let activeTabId = initialActiveTabId;

  return {
    get tabs() {
      return tabs;
    },
    get activeTabId() {
      return activeTabId;
    },
    setTabs: (action: SetStateAction<QueryTab[]>) => {
      tabs = typeof action === "function" ? action(tabs) : action;
    },
    setActiveTabId: (tabId: string) => {
      activeTabId = tabId;
    },
  };
}

test("session runner repairs stale active query tab selection", () => {
  const harness = createTabHarness([tab("a"), tab("b")], "missing");

  const changed = runRepairActiveQueryTabSelection({
    tabs: harness.tabs,
    activeTabId: harness.activeTabId,
    connectionId: "conn-1",
    setTabs: harness.setTabs,
    setActiveTabId: harness.setActiveTabId,
  });

  assert.equal(changed, true);
  assert.equal(harness.activeTabId, "a");
  assert.deepEqual(harness.tabs, [tab("a"), tab("b")]);
});

test("session runner does not mutate already valid query tab selection", () => {
  const harness = createTabHarness([tab("a"), tab("b")], "b");

  const changed = runRepairActiveQueryTabSelection({
    tabs: harness.tabs,
    activeTabId: harness.activeTabId,
    connectionId: "conn-1",
    setTabs: () => assert.fail("valid tabs should not be replaced"),
    setActiveTabId: () => assert.fail("valid active tab should not change"),
  });

  assert.equal(changed, false);
  assert.equal(harness.activeTabId, "b");
});

test("session runner persists connection-scoped workbench state", () => {
  const saved: Array<{ connectionId: string; state: WorkbenchSessionState }> = [];

  const persisted = runPersistWorkbenchSession({
    connection: {
      id: "conn-1",
      driver: "postgres",
    },
    tabs: [tab("a")],
    activeTabId: "a",
    recentQueries: ["select 1"],
    queryHistory: [],
    sqlMemory: createEmptySqlWorkbenchMemory(),
    savedSnippets: [],
    selectedTableName: "users",
    activeSchema: "audit",
    resultTab: "jobs",
    objectInspection: null,
    restoredInspectionTarget: {
      objectKind: "table",
      objectName: "users",
      signature: null,
      parentObjectName: null,
    },
    schemaDiffTargetConnectionId: "conn-2",
    syncSourceConnectionId: "conn-1",
    syncTargetConnectionId: "conn-2",
    selectedJobId: "job-1",
    saveSession: (connectionId, state) => saved.push({ connectionId, state }),
  });

  assert.equal(persisted, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].connectionId, "conn-1");
  assert.equal(saved[0].state.tabs[0]?.connectionId, "conn-1");
  assert.equal(saved[0].state.activeSchema, "audit");
  assert.equal(saved[0].state.lastResultTab, "jobs");
  assert.deepEqual(saved[0].state.inspectionTarget, {
    objectKind: "table",
    objectName: "users",
    signature: null,
    parentObjectName: null,
  });
});

test("session runner skips persistence without a connection id", () => {
  const persisted = runPersistWorkbenchSession({
    connection: {
      id: "",
      driver: "mysql",
    },
    tabs: [tab("a")],
    activeTabId: "a",
    recentQueries: [],
    queryHistory: [],
    sqlMemory: createEmptySqlWorkbenchMemory(),
    savedSnippets: [],
    selectedTableName: null,
    activeSchema: "public",
    resultTab: "results",
    objectInspection: null,
    restoredInspectionTarget: null,
    schemaDiffTargetConnectionId: "",
    syncSourceConnectionId: "",
    syncTargetConnectionId: "",
    selectedJobId: null,
    saveSession: () => assert.fail("empty connection id should not persist"),
  });

  assert.equal(persisted, false);
});
