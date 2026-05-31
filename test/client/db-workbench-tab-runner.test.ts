import test from "node:test";
import assert from "node:assert/strict";
import type { SetStateAction } from "react";
import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";
import {
  runAppendBlankQueryTab,
  runCloseQueryTab,
  runInsertSqlIntoActiveQueryTab,
  runOpenSqlInNewQueryTab,
  runRenameQueryTab,
  runReplaceActiveQueryTabSql,
  runSelectQueryTab,
} from "../../client/src/components/extensions/db-workbench/workbench-tab-runner";

function tab(id: string, label = id, sql = "", connectionId = "conn-1"): QueryTab {
  return {
    id,
    label,
    sql,
    connectionId,
  };
}

function createHarness(initialTabs: QueryTab[], initialActiveTabId = initialTabs[0].id) {
  let tabs = initialTabs;
  let activeTabId = initialActiveTabId;
  const events: string[] = [];

  const setTabs = (action: SetStateAction<QueryTab[]>) => {
    tabs = typeof action === "function" ? action(tabs) : action;
    events.push(`tabs:${tabs.map((item) => item.id).join(",")}`);
  };
  const setActiveTabId = (tabId: string) => {
    activeTabId = tabId;
    events.push(`active:${tabId}`);
  };

  return {
    get tabs() {
      return tabs;
    },
    get activeTabId() {
      return activeTabId;
    },
    events,
    setTabs,
    setActiveTabId,
  };
}

test("tab runner replaces and inserts SQL through the active tab boundary", () => {
  const harness = createHarness([tab("a", "A", "select 1"), tab("b", "B")], "b");

  runReplaceActiveQueryTabSql({
    activeTabId: harness.activeTabId,
    sql: "select 2",
    setTabs: harness.setTabs,
  });
  assert.deepEqual(harness.tabs, [
    tab("a", "A", "select 1"),
    tab("b", "B", "select 2"),
  ]);

  runInsertSqlIntoActiveQueryTab({
    activeTabId: harness.activeTabId,
    sql: "   ",
    setTabs: harness.setTabs,
  });
  assert.deepEqual(harness.tabs, [
    tab("a", "A", "select 1"),
    tab("b", "B", "select 2"),
  ]);

  runInsertSqlIntoActiveQueryTab({
    activeTabId: harness.activeTabId,
    sql: "select 3",
    setTabs: harness.setTabs,
  });
  assert.deepEqual(harness.tabs, [
    tab("a", "A", "select 1"),
    tab("b", "B", "select 3"),
  ]);
});

test("tab runner appends selects closes and renames query tabs", () => {
  const harness = createHarness([tab("a"), tab("b"), tab("c")], "c");

  runSelectQueryTab({ tabId: "b", setActiveTabId: harness.setActiveTabId });
  assert.equal(harness.activeTabId, "b");

  runAppendBlankQueryTab({
    connectionId: "conn-2",
    setTabs: harness.setTabs,
    setActiveTabId: harness.setActiveTabId,
  });
  const appended = harness.tabs.at(-1);
  assert.equal(appended?.label, "Query 4");
  assert.equal(appended?.connectionId, "conn-2");
  assert.equal(harness.activeTabId, appended?.id);

  runCloseQueryTab({
    activeTabId: harness.activeTabId,
    tabId: harness.activeTabId,
    setTabs: harness.setTabs,
    setActiveTabId: harness.setActiveTabId,
  });
  assert.deepEqual(harness.tabs.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(harness.activeTabId, "c");

  runRenameQueryTab({
    tabId: "c",
    newLabel: "Renamed",
    setTabs: harness.setTabs,
  });
  assert.equal(harness.tabs.find((item) => item.id === "c")?.label, "Renamed");
});

test("tab runner opens trimmed SQL in a new tab and ignores blank SQL", () => {
  const harness = createHarness([tab("a")], "a");

  runOpenSqlInNewQueryTab({
    connectionId: "conn-1",
    sql: "  select * from users  ",
    label: " Users ",
    setTabs: harness.setTabs,
    setActiveTabId: harness.setActiveTabId,
  });
  assert.equal(harness.tabs.length, 2);
  assert.equal(harness.tabs[1].label, "Users");
  assert.equal(harness.tabs[1].sql, "select * from users");
  assert.equal(harness.activeTabId, harness.tabs[1].id);

  runOpenSqlInNewQueryTab({
    connectionId: "conn-1",
    sql: "   ",
    label: "Ignored",
    setTabs: harness.setTabs,
    setActiveTabId: harness.setActiveTabId,
  });
  assert.equal(harness.tabs.length, 2);
});
