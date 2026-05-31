import test from "node:test";
import assert from "node:assert/strict";
import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";
import {
  appendBlankQueryTab,
  closeQueryTab,
  openSqlInQueryTab,
  renameQueryTab,
  replaceQueryTabSql,
} from "../../client/src/components/extensions/db-workbench/workbench-tab-runtime";

function tab(id: string, label = id, sql = ""): QueryTab {
  return {
    id,
    label,
    sql,
    connectionId: "conn-1",
  };
}

test("tab runtime replaces SQL only on the active tab", () => {
  assert.deepEqual(
    replaceQueryTabSql([tab("a", "A", "select 1"), tab("b", "B")], "b", "select 2"),
    [tab("a", "A", "select 1"), tab("b", "B", "select 2")],
  );
});

test("tab runtime appends blank tabs with connection scope and active id", () => {
  assert.deepEqual(
    appendBlankQueryTab({
      tabs: [tab("a")],
      connectionId: "conn-2",
      id: "new-tab",
    }),
    {
      tabs: [
        tab("a"),
        {
          id: "new-tab",
          label: "Query 2",
          sql: "",
          connectionId: "conn-2",
        },
      ],
      activeTabId: "new-tab",
    },
  );
});

test("tab runtime closes active tabs by selecting the previous neighbor", () => {
  assert.deepEqual(
    closeQueryTab([tab("a"), tab("b"), tab("c")], "c", "c"),
    {
      tabs: [tab("a"), tab("b")],
      activeTabId: "b",
    },
  );
  assert.deepEqual(
    closeQueryTab([tab("a")], "a", "a"),
    {
      tabs: [tab("a")],
      activeTabId: "a",
    },
  );
});

test("tab runtime renames and opens SQL tabs deterministically", () => {
  assert.deepEqual(renameQueryTab([tab("a", "Old")], "a", "New"), [
    tab("a", "New"),
  ]);
  assert.deepEqual(
    openSqlInQueryTab({
      tabs: [tab("a")],
      connectionId: "conn-1",
      sql: "  select * from users  ",
      label: " Users ",
      id: "users-tab",
    }),
    {
      tabs: [tab("a"), tab("users-tab", "Users", "select * from users")],
      activeTabId: "users-tab",
    },
  );
  assert.equal(
    openSqlInQueryTab({
      tabs: [tab("a")],
      connectionId: "conn-1",
      sql: "   ",
      label: "Empty",
      id: "empty-tab",
    }),
    null,
  );
});
