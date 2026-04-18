import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("connection sidebar exposes referenced-table navigation from foreign key rows", async () => {
  const sidebar = await read(
    "client/src/components/extensions/db-workbench/ConnectionSidebar.tsx",
  );

  assert.match(sidebar, /Inspect ref/);
  assert.match(sidebar, /Open ref/);
  assert.match(sidebar, /onInspectObject\?\.\("table", foreignKey\.referencedTable\)/);
  assert.match(sidebar, /onOpenTable\?\.\(foreignKey\.referencedTable\)/);
});

test("inspection pane exposes referenced-table navigation from foreign key metadata", async () => {
  const inspectionPane = await read(
    "client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx",
  );

  assert.match(inspectionPane, /onInspectObject\?:/);
  assert.match(inspectionPane, /onOpenTable\?:/);
  assert.match(inspectionPane, /Inspect ref/);
  assert.match(inspectionPane, /Open ref/);
  assert.match(inspectionPane, /onInspectObject\?\.\("table", foreignKey\.referencedTable\)/);
  assert.match(inspectionPane, /onOpenTable\?\.\(foreignKey\.referencedTable\)/);
});

test("workbench routes relation-navigation actions into table open and inspection handlers", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /onInspectObject=\{\(objectKind, objectName\) => \{/);
  assert.match(workbench, /void handleInspectObject\(objectKind, objectName\)/);
  assert.match(workbench, /onOpenTable=\{\(tableName\) => \{/);
  assert.match(workbench, /void handleOpenTable\(tableName\)/);
});

test("feature checklist tracks shipped relation navigation and remaining product gaps", async () => {
  const checklist = await read("docs/db-workbench-feature-checklist.md");

  assert.match(checklist, /FK-aware relation navigation \| `Shipped`/);
  assert.match(checklist, /ER diagram \/ relation canvas \| `Gap`/);
  assert.match(checklist, /visual schema authoring \/ migration designer/);
});
