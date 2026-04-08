import test from "node:test";
import assert from "node:assert/strict";
import {
  appendRecentQuery,
  loadSessionForConnection,
  saveSessionForConnection,
  saveSnippet,
} from "../../client/src/components/extensions/db-workbench/workbench-session.ts";

function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  } as Storage;
}

function withWindowStorage(run: () => void): void {
  const globalWithWindow = globalThis as typeof globalThis & { window?: unknown };
  const previousWindow = globalWithWindow.window;
  globalWithWindow.window = { localStorage: createLocalStorage() };
  try {
    run();
  } finally {
    if (typeof previousWindow === "undefined") {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = previousWindow;
    }
  }
}

test("switching connection restores isolated tabs and draft sql", () => {
  withWindowStorage(() => {
    saveSessionForConnection("conn-a", {
      tabs: [
        {
          id: "a-tab-1",
          label: "A1",
          sql: "SELECT * FROM users;",
          connectionId: "conn-a",
        },
      ],
      activeTabId: "a-tab-1",
    });

    saveSessionForConnection("conn-b", {
      tabs: [
        {
          id: "b-tab-1",
          label: "B1",
          sql: "SELECT * FROM orders;",
          connectionId: "conn-b",
        },
      ],
      activeTabId: "b-tab-1",
    });

    const sessionA = loadSessionForConnection("conn-a");
    const sessionB = loadSessionForConnection("conn-b");

    assert.equal(sessionA.tabs[0]?.sql, "SELECT * FROM users;");
    assert.equal(sessionB.tabs[0]?.sql, "SELECT * FROM orders;");
    assert.notEqual(sessionA.tabs[0]?.sql, sessionB.tabs[0]?.sql);
  });
});

test("recent sql is isolated per connection", () => {
  withWindowStorage(() => {
    appendRecentQuery("conn-a", "SELECT * FROM users;");
    appendRecentQuery("conn-a", "SELECT * FROM accounts;");
    appendRecentQuery("conn-b", "SELECT * FROM orders;");

    const sessionA = loadSessionForConnection("conn-a");
    const sessionB = loadSessionForConnection("conn-b");

    assert.deepEqual(sessionA.recentQueries, [
      "SELECT * FROM accounts;",
      "SELECT * FROM users;",
    ]);
    assert.deepEqual(sessionB.recentQueries, ["SELECT * FROM orders;"]);
  });
});

test("snippet list is isolated per connection", () => {
  withWindowStorage(() => {
    saveSnippet("conn-a", "Users snippet", "SELECT * FROM users;");
    saveSnippet("conn-b", "Orders snippet", "SELECT * FROM orders;");

    const sessionA = loadSessionForConnection("conn-a");
    const sessionB = loadSessionForConnection("conn-b");

    assert.equal(sessionA.snippets[0]?.name, "Users snippet");
    assert.equal(sessionB.snippets[0]?.name, "Orders snippet");
    assert.notEqual(sessionA.snippets[0]?.name, sessionB.snippets[0]?.name);
  });
});

test("switching connection restores selected table focus per connection", () => {
  withWindowStorage(() => {
    saveSessionForConnection("conn-a", {
      tabs: [
        {
          id: "a-tab-1",
          label: "A1",
          sql: "SELECT * FROM users;",
          connectionId: "conn-a",
        },
      ],
      activeTabId: "a-tab-1",
      selectedTableName: "users",
    });

    saveSessionForConnection("conn-b", {
      tabs: [
        {
          id: "b-tab-1",
          label: "B1",
          sql: "SELECT * FROM orders;",
          connectionId: "conn-b",
        },
      ],
      activeTabId: "b-tab-1",
      selectedTableName: "orders",
    });

    const sessionA = loadSessionForConnection("conn-a");
    const sessionB = loadSessionForConnection("conn-b");

    assert.equal(sessionA.selectedTableName, "users");
    assert.equal(sessionB.selectedTableName, "orders");
    assert.notEqual(sessionA.selectedTableName, sessionB.selectedTableName);
  });
});
