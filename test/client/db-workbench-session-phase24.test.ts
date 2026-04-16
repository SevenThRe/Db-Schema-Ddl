import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadSessionForConnection,
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

test("session persistence restores pane, schema, inspection, and compare/sync targets", () => {
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
      activeSchema: "analytics",
      lastResultTab: "inspect",
      inspectionTarget: {
        objectKind: "table",
        objectName: "users",
        signature: null,
        parentObjectName: null,
      },
      schemaDiffTargetConnectionId: "conn-b",
      syncSourceConnectionId: "conn-c",
      syncTargetConnectionId: "conn-d",
    });

    const session = loadSessionForConnection("conn-a");

    assert.equal(session.activeSchema, "analytics");
    assert.equal(session.lastResultTab, "inspect");
    assert.deepEqual(session.inspectionTarget, {
      objectKind: "table",
      objectName: "users",
      signature: null,
      parentObjectName: null,
    });
    assert.equal(session.schemaDiffTargetConnectionId, "conn-b");
    assert.equal(session.syncSourceConnectionId, "conn-c");
    assert.equal(session.syncTargetConnectionId, "conn-d");
  });
});

test("inspect pane falls back to results when no inspection target is stored", () => {
  withWindowStorage(() => {
    saveSessionForConnection("conn-a", {
      lastResultTab: "inspect",
      inspectionTarget: null,
    });

    const session = loadSessionForConnection("conn-a");
    assert.equal(session.lastResultTab, "results");
    assert.equal(session.inspectionTarget, null);
  });
});

test("db connector shell contains explicit recovery notice for missing remembered connection", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );

  assert.match(workspace, /Connection recovery/);
  assert.match(workspace, /未能恢复上次活动连接/);
});
