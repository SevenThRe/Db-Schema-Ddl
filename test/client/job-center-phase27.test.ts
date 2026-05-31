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
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const resultHeader = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspaceHeader.tsx",
  );
  const resultWorkspacePane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
  );
  const jobCenterPane = await read(
    "client/src/components/extensions/db-workbench/JobCenterPane.tsx",
  );
  const jobCenterListSections = await read(
    "client/src/components/extensions/db-workbench/job-center-list-sections.tsx",
  );
  const jobCenterDetailSections = await read(
    "client/src/components/extensions/db-workbench/job-center-detail-sections.tsx",
  );
  const secondaryPanePropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-secondary-pane-props.ts",
  );
  const jobCenterRunner = await read(
    "client/src/components/extensions/db-workbench/job-center-runner.ts",
  );
  const syncJobController = await read(
    "client/src/components/extensions/db-workbench/workbench-sync-job-controller.ts",
  );
  const workspaceBody = await read(
    "client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
  );
  const workflowControllers = await read(
    "client/src/components/extensions/db-workbench/use-workbench-workflow-controllers.ts",
  );
  const syncJobWorkflowController = await read(
    "client/src/components/extensions/db-workbench/use-workbench-sync-job-workflow-controller.ts",
  );
  const renderPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  );
  const resultWorkspaceLayoutProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-result-workspace-props.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );

  assert.match(workbench, /<WorkbenchWorkspaceBody/);
  assert.match(workspaceBody, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(resultWorkspacePane, /<WorkbenchResultWorkspaceHeader \{\.\.\.header\} \/>/);
  assert.match(resultHeader, /<TabsTrigger value="jobs" className="h-6 text-xs">/);
  assert.match(resultWorkspacePane, /<JobCenterPane \{\.\.\.jobs\} \/>/);
  assert.match(workbench, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilder, /buildWorkbenchLayoutResultWorkspaceProps\(\{/);
  assert.match(resultWorkspaceLayoutProps, /jobs: secondaryPaneProps\.jobs,/);
  assert.match(secondaryPanePropsBuilder, /onRefresh: \(\) => \{/);
  assert.match(secondaryPanePropsBuilder, /void input\.jobs\.onRefresh\(\);/);
  assert.match(secondaryPanePropsBuilder, /void input\.jobs\.onReopenSyncContext\(jobId\);/);
  assert.doesNotMatch(workbench, /onRefresh: \(\) => \{\s*void refreshBackgroundJobs\(\);/);
  assert.match(workbench, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchLayoutWorkflowControllers\(\{/);
  assert.match(workflowControllers, /useWorkbenchSyncJobWorkflowController\(input\)/);
  assert.match(syncJobWorkflowController, /createWorkbenchSyncJobController\(\{/);
  assert.match(syncJobController, /runOpenJobCenterForJob\(\{/);
  assert.match(syncJobController, /runReopenSyncContext\(\{/);
  assert.match(jobCenterRunner, /input\.setResultTab\("jobs"\);/);
  assert.match(jobCenterRunner, /input\.setSelectedJobId\(input\.jobId\);/);
  assert.match(jobCenterRunner, /input\.setResultTab\("sync"\);/);
  assert.match(jobCenterPane, /<JobCenterListPane/);
  assert.match(jobCenterPane, /<JobCenterDetailPane/);
  assert.match(jobCenterListSections, /Recent background DB work/);
  assert.match(jobCenterDetailSections, /Reopen sync context/);
});
