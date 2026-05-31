import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadSessionForConnection,
  recordQueryRun,
  saveSessionForConnection,
} from "../../client/src/components/extensions/db-workbench/workbench-session.ts";

const ROOT = process.cwd();

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

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench session facade only re-exports codec, store, history, and memory modules", async () => {
  const facade = await read(
    "client/src/components/extensions/db-workbench/workbench-session.ts",
  );

  assert.match(facade, /from "\.\/workbench-session-types"/);
  assert.match(facade, /from "\.\/workbench-session-codec"/);
  assert.match(facade, /from "\.\/workbench-session-store"/);
  assert.match(facade, /from "\.\/workbench-session-history"/);
  assert.match(facade, /from "\.\/workbench-session-memory"/);

  // The facade carries no implementation of its own.
  assert.doesNotMatch(facade, /function sanitizeSession/);
  assert.doesNotMatch(facade, /function loadSessionForConnection/);
  assert.doesNotMatch(facade, /function recordQueryRun/);
  assert.doesNotMatch(facade, /window\.localStorage/);
});

test("workbench session modules own their respective responsibilities", async () => {
  const codec = await read(
    "client/src/components/extensions/db-workbench/workbench-session-codec.ts",
  );
  const store = await read(
    "client/src/components/extensions/db-workbench/workbench-session-store.ts",
  );
  const history = await read(
    "client/src/components/extensions/db-workbench/workbench-session-history.ts",
  );
  const memory = await read(
    "client/src/components/extensions/db-workbench/workbench-session-memory.ts",
  );

  // Codec is the pure serialize/sanitize boundary and must not touch storage IO.
  assert.match(codec, /export function sanitizeSession/);
  assert.match(codec, /export const EMPTY_SESSION/);
  assert.doesNotMatch(codec, /window\.localStorage/);

  // Store is the hydration/restore IO boundary.
  assert.match(store, /export function loadSessionForConnection/);
  assert.match(store, /export function saveSessionForConnection/);
  assert.match(store, /window\.localStorage/);

  assert.match(history, /export function recordQueryRun/);
  assert.match(history, /export function appendRecentQuery/);
  assert.match(history, /export function saveSnippet/);

  assert.match(memory, /export function recordAcceptedSqlSuggestion/);
  assert.match(memory, /export function clearSqlMemory/);
});

test("session restore keeps connection, schema, and tab scoping explicit", () => {
  withWindowStorage(() => {
    saveSessionForConnection("conn-a", {
      activeSchema: "analytics",
      selectedTableName: "orders",
      tabs: [
        // A persisted tab from a stale connection must be re-scoped, never silently
        // attributed to a different live connection.
        {
          id: "tab-1",
          label: "T1",
          sql: "SELECT 1;",
          connectionId: "conn-a",
        },
      ],
      activeTabId: "tab-1",
    });

    // Recording a run for the same connection preserves the restored schema and tabs.
    recordQueryRun("conn-a", {
      sql: "SELECT * FROM orders;",
      mode: "statement",
      status: "success",
      statementCount: 1,
      returnedRows: 5,
    });

    const session = loadSessionForConnection("conn-a");
    assert.equal(session.activeSchema, "analytics");
    assert.equal(session.selectedTableName, "orders");
    assert.equal(session.tabs[0]?.connectionId, "conn-a");
    assert.equal(session.queryHistory.length, 1);
    assert.equal(session.queryHistory[0]?.sql, "SELECT * FROM orders;");

    // A different connection must not inherit conn-a's restored state.
    const other = loadSessionForConnection("conn-b");
    assert.equal(other.activeSchema, null);
    assert.equal(other.tabs.length, 0);
    assert.equal(other.queryHistory.length, 0);
  });
});
