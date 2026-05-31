import test from "node:test";
import assert from "node:assert/strict";

import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";
import {
  createWorkbenchTabController,
} from "../../client/src/components/extensions/db-workbench/workbench-tab-controller.ts";

function createHarness() {
  let activeTabId = "tab-a";
  let tabs: QueryTab[] = [
    { id: "tab-a", label: "A", sql: "select 1", connectionId: "conn-a" },
    { id: "tab-b", label: "B", sql: "select 2", connectionId: "conn-a" },
  ];
  const setActiveTabId = (tabId: string) => {
    activeTabId = tabId;
  };
  const setTabs = (next: QueryTab[] | ((current: QueryTab[]) => QueryTab[])) => {
    tabs = typeof next === "function" ? next(tabs) : next;
  };
  const controller = () =>
    createWorkbenchTabController({
      activeTabId,
      connectionId: "conn-a",
      setActiveTabId,
      setTabs,
      focusSqlEditor: () => undefined,
    });

  return {
    controller,
    get activeTabId() {
      return activeTabId;
    },
    get tabs() {
      return tabs;
    },
  };
}

test("workbench tab controller centralizes active tab mutation handlers", () => {
  const harness = createHarness();

  harness.controller().handleSqlChange("select changed");
  assert.equal(harness.tabs[0]?.sql, "select changed");

  harness.controller().insertSqlIntoActiveTab("  ");
  assert.equal(harness.tabs[0]?.sql, "select changed");

  harness.controller().handleTabChange("tab-b");
  assert.equal(harness.activeTabId, "tab-b");

  harness.controller().handleTabRename("tab-b", "Renamed");
  assert.equal(harness.tabs[1]?.label, "Renamed");

  harness.controller().handleTabAdd();
  assert.equal(harness.tabs.length, 3);
  assert.equal(harness.tabs[2]?.connectionId, "conn-a");
  assert.equal(harness.activeTabId, harness.tabs[2]?.id);

  harness.controller().openSqlInNewTab("select * from orders", "Orders");
  assert.equal(harness.tabs.length, 4);
  assert.equal(harness.tabs[3]?.label, "Orders");
  assert.equal(harness.activeTabId, harness.tabs[3]?.id);

  harness.controller().handleCloseActiveTab();
  assert.equal(harness.tabs.length, 3);
  assert.notEqual(harness.activeTabId, harness.tabs[3]?.id);
});
