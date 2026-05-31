import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIMARY_WORKSPACE_VIEW,
  WORKSPACE_SURFACE_META,
  isWorkspaceView,
  persistWorkspaceRoute,
  readInitialSelectedConnectionId,
  readInitialWorkspaceView,
} from "../../client/src/components/extensions/db-workbench/workbench-workspace-route";

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
      return store.get(key) ?? null;
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

function withWindow(
  href: string,
  run: (localStorage: Storage, historyUpdates: string[]) => void,
): void {
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: unknown;
  };
  const previousWindow = globalWithWindow.window;
  const localStorage = createLocalStorage();
  const historyUpdates: string[] = [];

  globalWithWindow.window = {
    location: { href, search: new URL(href).search },
    localStorage,
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: URL) => {
        historyUpdates.push(url.toString());
      },
    },
  };

  try {
    run(localStorage, historyUpdates);
  } finally {
    if (typeof previousWindow === "undefined") {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = previousWindow;
    }
  }
}

test("workspace route taxonomy keeps one primary database workspace", () => {
  assert.equal(PRIMARY_WORKSPACE_VIEW, "sql");
  assert.equal(WORKSPACE_SURFACE_META.sql.status, "Primary");
  assert.equal(WORKSPACE_SURFACE_META.connections.status, "Primary Support");
  assert.equal(WORKSPACE_SURFACE_META.schema.status, "Compatibility");
  assert.equal(WORKSPACE_SURFACE_META.diff.status, "Compatibility");
  assert.equal(isWorkspaceView("sql"), true);
  assert.equal(isWorkspaceView("legacy"), false);
});

test("workspace route restores selected connection into the primary workspace", () => {
  withWindow("http://127.0.0.1:5001/?db-workbench-view=diff", () => {
    assert.equal(readInitialWorkspaceView("conn-1"), PRIMARY_WORKSPACE_VIEW);
  });
});

test("workspace route persists view and selected connection together", () => {
  withWindow("http://127.0.0.1:5001/", (localStorage, historyUpdates) => {
    persistWorkspaceRoute("sql", "conn-7");

    assert.equal(
      localStorage.getItem("db-workbench:workspace-view:v1"),
      "sql",
    );
    assert.equal(
      localStorage.getItem("db-workbench:selected-connection:v1"),
      "conn-7",
    );
    assert.equal(readInitialSelectedConnectionId(), "conn-7");
    assert.match(historyUpdates[0] ?? "", /db-workbench-view=sql/);
    assert.match(historyUpdates[0] ?? "", /db-workbench-connection=conn-7/);
  });
});
