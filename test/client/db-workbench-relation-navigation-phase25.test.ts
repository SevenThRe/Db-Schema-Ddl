import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("connection sidebar exposes referenced-table navigation from foreign key rows", async () => {
  const sidebar =
    (await read("client/src/components/extensions/db-workbench/ConnectionSidebar.tsx")) +
    (await read(
      "client/src/components/extensions/db-workbench/connection-sidebar-object-explorer.tsx",
    )) +
    (await read(
      "client/src/components/extensions/db-workbench/connection-sidebar-table-tree.tsx",
    ));

  assert.match(sidebar, /Inspect ref/);
  assert.match(sidebar, /Open ref/);
  assert.match(sidebar, /onInspectObject\?\.\("table", foreignKey\.referencedTable\)/);
  assert.match(sidebar, /onOpenTable\?\.\(foreignKey\.referencedTable\)/);
});

test("inspection pane exposes referenced-table navigation from foreign key metadata", async () => {
  const inspectionPane = await read(
    "client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx",
  );
  const inspectionSections = await read(
    "client/src/components/extensions/db-workbench/object-inspection-sections.tsx",
  );

  assert.match(inspectionPane, /onInspectObject\?:/);
  assert.match(inspectionPane, /onOpenTable\?:/);
  assert.match(inspectionPane, /<ObjectInspectionMetadataView/);
  assert.match(inspectionSections, /Inspect ref/);
  assert.match(inspectionSections, /Open ref/);
  assert.match(inspectionSections, /onInspectObject\?\.\("table", foreignKey\.referencedTable\)/);
  assert.match(inspectionSections, /onOpenTable\?\.\(foreignKey\.referencedTable\)/);
});

test("workbench routes relation-navigation actions into table open and inspection handlers", async () => {
  const workbench =
    (await read("client/src/components/extensions/db-workbench/WorkbenchLayout.tsx")) +
    (await read("client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts"));
  const resultWorkspacePane = await read(
    "client/src/components/extensions/db-workbench/WorkbenchResultWorkspacePane.tsx",
  );
  const workspaceBody = await read(
    "client/src/components/extensions/db-workbench/WorkbenchWorkspaceBody.tsx",
  );
  const secondaryPanePropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-secondary-pane-props.ts",
  );
  const renderPropsBuilder = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-render-props.ts",
  );
  const resultWorkspaceLayoutProps = await read(
    "client/src/components/extensions/db-workbench/workbench-layout-result-workspace-props.ts",
  );

  assert.match(workbench, /<WorkbenchWorkspaceBody/);
  assert.match(workspaceBody, /<WorkbenchResultWorkspacePane \{\.\.\.resultWorkspace\} \/>/);
  assert.match(resultWorkspacePane, /<ObjectInspectionPane \{\.\.\.inspection\} \/>/);
  assert.match(workbench, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(renderPropsBuilder, /buildWorkbenchLayoutResultWorkspaceProps\(\{/);
  assert.match(resultWorkspaceLayoutProps, /inspection: secondaryPaneProps\.inspection,/);
  assert.match(secondaryPanePropsBuilder, /onInspectObject: \(objectKind, objectName\) => \{/);
  assert.match(secondaryPanePropsBuilder, /void input\.inspection\.onInspectObject\(objectKind, objectName\)/);
  assert.match(secondaryPanePropsBuilder, /onOpenTable: \(tableName\) => \{/);
  assert.match(secondaryPanePropsBuilder, /void input\.inspection\.onOpenTable\(tableName\)/);
});

test("feature checklist tracks shipped relation navigation and remaining product gaps", async () => {
  const checklist = await read("docs/db-workbench-feature-checklist.md");

  assert.match(checklist, /FK-aware relation navigation \| `Shipped`/);
  assert.match(checklist, /ER diagram \/ relation canvas \| `Gap`/);
  assert.match(checklist, /visual schema authoring \/ migration designer/);
});
