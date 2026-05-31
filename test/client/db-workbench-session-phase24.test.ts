import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadSessionForConnection,
  saveSessionForConnection,
} from "../../client/src/components/extensions/db-workbench/workbench-session.ts";
import {
  hydrateConnectionSession,
} from "../../client/src/components/extensions/db-workbench/workbench-session-hydration.ts";

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

test("session hydration normalizes tabs to the active connection and repairs active tab", () => {
  withWindowStorage(() => {
    saveSessionForConnection("conn-a", {
      tabs: [
        {
          id: "tab-1",
          label: "Restored",
          sql: "SELECT * FROM users;",
          connectionId: "stale-connection",
        },
      ],
      activeTabId: "missing-tab",
      selectedJobId: "job-1",
    });

    const hydrated = hydrateConnectionSession("conn-a");

    assert.equal(hydrated.tabs.length, 1);
    assert.equal(hydrated.tabs[0]?.connectionId, "conn-a");
    assert.equal(hydrated.activeTabId, "tab-1");
    assert.equal(hydrated.selectedJobId, "job-1");
  });
});

test("db connector shell contains explicit recovery notice for missing remembered connection", async () => {
  const shell = await read(
    "client/src/components/extensions/db-workbench/DbConnectorWorkspaceShell.tsx",
  );
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );
  const controller = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-controller.ts",
  );
  const runtimeEffects = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-runtime-effects.ts",
  );

  assert.match(workspace, /useDbConnectorWorkspaceController/);
  assert.match(controller, /resumeRecoveryNotice/);
  assert.match(controller, /useDbConnectorWorkspaceRuntimeEffects/);
  assert.match(shell, /Connection recovery/);
  assert.match(runtimeEffects, /db_workbench_recovery_classified/);
  assert.match(runtimeEffects, /未能恢复上次活动连接/);
});
