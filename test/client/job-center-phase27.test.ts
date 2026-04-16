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

test("workbench session persists jobs tab and selected background job id", () => {
  withWindowStorage(() => {
    saveSessionForConnection("conn-a", {
      lastResultTab: "jobs",
      selectedJobId: "job-27",
    });

    const session = loadSessionForConnection("conn-a");

    assert.equal(session.lastResultTab, "jobs");
    assert.equal(session.selectedJobId, "job-27");
  });
});

test("job center is wired into the canonical workbench route and can reopen sync context", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const jobCenterPane = await read(
    "client/src/components/extensions/db-workbench/JobCenterPane.tsx",
  );

  assert.match(workbench, /<TabsTrigger value="jobs" className="h-6 text-xs">/);
  assert.match(workbench, /<JobCenterPane/);
  assert.match(workbench, /setResultTab\("jobs"\);/);
  assert.match(workbench, /setSelectedJobId\(jobId\);/);
  assert.match(workbench, /setResultTab\("sync"\);/);
  assert.match(jobCenterPane, /Recent background DB work/);
  assert.match(jobCenterPane, /Reopen sync context/);
});
