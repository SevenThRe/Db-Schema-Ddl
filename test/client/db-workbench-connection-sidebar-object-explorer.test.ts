import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("connection sidebar delegates object explorer rendering to a focused component", async () => {
  const sidebar = await read(
    "client/src/components/extensions/db-workbench/ConnectionSidebar.tsx",
  );
  const objectExplorer = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-object-explorer.tsx",
  );
  const connectionControl = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-connection-control.tsx",
  );
  const tableTree = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-table-tree.tsx",
  );
  const objectFamilyLists = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-object-family-lists.tsx",
  );
  const explorerBadge = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-explorer-badge.tsx",
  );

  assert.match(sidebar, /<ConnectionSidebarConnectionControl/);
  assert.doesNotMatch(sidebar, /Switch connection/);
  assert.doesNotMatch(sidebar, /No connections saved/);
  assert.match(connectionControl, /Switch connection/);
  assert.match(connectionControl, /No connections saved/);
  assert.match(connectionControl, /schema-select/);
  assert.match(sidebar, /<ConnectionSidebarObjectExplorer/);
  assert.doesNotMatch(sidebar, /function ExplorerBadge/);
  assert.doesNotMatch(sidebar, /filterTableContents/);
  assert.match(objectExplorer, /<ConnectionSidebarTableTree/);
  assert.match(objectExplorer, /<ConnectionSidebarObjectFamilyLists/);
  assert.doesNotMatch(objectExplorer, /filterTableContents/);
  assert.match(tableTree, /filterTableContents/);
  assert.match(tableTree, /Foreign Keys/);
  assert.match(tableTree, /Inspect ref/);
  assert.match(tableTree, /Open ref/);
  assert.match(objectFamilyLists, /Views/);
  assert.match(objectFamilyLists, /Routines/);
  assert.match(objectFamilyLists, /Triggers/);
  assert.match(objectFamilyLists, /Sequences/);
  assert.match(explorerBadge, /function ExplorerBadge/);
});
