import test from "node:test";
import assert from "node:assert/strict";

import {
  appendRecentQuery,
  loadSessionForConnection,
  saveSessionForConnection,
  saveSnippet,
} from "../../client/src/components/extensions/db-workbench/workbench-session.ts";

interface MemoryStorage {
  clear: () => void;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
  length: number;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function installWindowWithStorage(): void {
  const localStorage = createMemoryStorage();
  Reflect.set(globalThis, "window", { localStorage });
}

function normalizeSqlForTest(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

test.beforeEach(() => {
  installWindowWithStorage();
});

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("restores session state by connection id", () => {
  saveSessionForConnection("conn-alpha", {
    tabs: [
      {
        id: "tab-alpha",
        label: "Alpha",
        sql: "SELECT * FROM alpha;",
        connectionId: "conn-alpha",
      },
    ],
    activeTabId: "tab-alpha",
    recentQueries: ["SELECT * FROM alpha;"],
    snippets: [],
  });

  const restored = loadSessionForConnection("conn-alpha");
  assert.equal(restored.tabs.length, 1);
  assert.equal(restored.tabs[0]?.id, "tab-alpha");
  assert.equal(restored.activeTabId, "tab-alpha");
  assert.equal(restored.recentQueries[0], "SELECT * FROM alpha;");
});

test("does not leak tabs across connection ids", () => {
  saveSessionForConnection("conn-a", {
    tabs: [
      {
        id: "tab-a",
        label: "A",
        sql: "SELECT 1;",
        connectionId: "conn-a",
      },
    ],
    activeTabId: "tab-a",
    recentQueries: [],
    snippets: [],
    selectedTableName: "users",
  });

  saveSessionForConnection("conn-b", {
    tabs: [
      {
        id: "tab-b",
        label: "B",
        sql: "SELECT 2;",
        connectionId: "conn-b",
      },
    ],
    activeTabId: "tab-b",
    recentQueries: [],
    snippets: [],
    selectedTableName: "orders",
  });

  const sessionA = loadSessionForConnection("conn-a");
  const sessionB = loadSessionForConnection("conn-b");

  assert.equal(sessionA.tabs[0]?.id, "tab-a");
  assert.equal(sessionB.tabs[0]?.id, "tab-b");
  assert.notEqual(sessionA.tabs[0]?.sql, sessionB.tabs[0]?.sql);
  assert.equal(sessionA.selectedTableName, "users");
  assert.equal(sessionB.selectedTableName, "orders");
  assert.notEqual(sessionA.selectedTableName, sessionB.selectedTableName);
});

test("recent query list dedupes by normalized SQL and caps at 30 items", () => {
  for (let index = 0; index < 32; index += 1) {
    appendRecentQuery("conn-recent", `SELECT ${index};`);
  }

  appendRecentQuery("conn-recent", "  select   5;  ");

  const session = loadSessionForConnection("conn-recent");
  assert.equal(session.recentQueries.length, 30);
  assert.equal(normalizeSqlForTest(session.recentQueries[0] ?? ""), "select 5;");

  const duplicateCount = session.recentQueries.filter(
    (sql) => normalizeSqlForTest(sql) === "select 5;",
  ).length;
  assert.equal(duplicateCount, 1);
});

test("saved snippets are stored and retrievable per connection", () => {
  saveSnippet("conn-snippet", "Orders", "SELECT * FROM orders LIMIT 10;");
  saveSnippet("conn-snippet", "Inventory", "SELECT * FROM inventory LIMIT 10;");
  saveSnippet("conn-snippet", "orders", "SELECT * FROM orders LIMIT 20;");

  const session = loadSessionForConnection("conn-snippet");
  assert.equal(session.snippets.length, 2);

  const ordersSnippet = session.snippets.find(
    (snippet) => snippet.name.toLowerCase() === "orders",
  );
  assert.ok(ordersSnippet);
  assert.equal(ordersSnippet.sql, "SELECT * FROM orders LIMIT 20;");
});
