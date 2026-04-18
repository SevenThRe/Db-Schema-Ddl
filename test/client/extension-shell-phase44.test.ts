import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("dashboard references the extension activity bar and secondary sidebar shell", async () => {
  const dashboard = await read("client/src/pages/Dashboard.tsx");

  assert.match(dashboard, /ExtensionActivityBar/);
  assert.match(dashboard, /ExtensionSecondarySidebar/);
  assert.match(dashboard, /dashboard:lastExtensionActivity/);
  assert.match(dashboard, /dashboard:lastSidebarViewByExtension/);
});

test("core sidebar no longer depends on extNavItems footer navigation", async () => {
  const sidebar = await read("client/src/components/Sidebar.tsx");

  assert.doesNotMatch(sidebar, /extNavItems/);
  assert.match(sidebar, /sidebar\.definitionFiles/);
  assert.match(sidebar, /extensions\.navLabel/);
});

test("db connector adopts explicit shell ids and host-managed sidebar mode", async () => {
  const builtinManifest = await read("src-tauri/src/builtin_extensions/mod.rs");
  const workbenchLayout = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(builtinManifest, /db-connector-activity/);
  assert.match(builtinManifest, /db-connector-sidebar-connections/);
  assert.match(builtinManifest, /db-connector-sidebar-explorer/);
  assert.match(workbenchLayout, /sidebarMode\?: "host" \| "embedded"/);
  assert.match(workbenchLayout, /sidebarMode === "host"/);
});
