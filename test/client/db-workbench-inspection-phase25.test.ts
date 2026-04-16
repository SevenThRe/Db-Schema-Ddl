import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("connection sidebar exposes deep inspection families in the explorer", async () => {
  const sidebar = await read(
    "client/src/components/extensions/db-workbench/ConnectionSidebar.tsx",
  );

  assert.match(sidebar, /Views/);
  assert.match(sidebar, /Routines/);
  assert.match(sidebar, /Triggers/);
  assert.match(sidebar, /Sequences/);
  assert.match(sidebar, /Indexes/);
  assert.match(sidebar, /Foreign Keys/);
  assert.match(sidebar, /onInspectObject\?\.\("view"/);
  assert.match(sidebar, /onInspectObject\?\.\(routine\.kind/);
  assert.match(sidebar, /onInspectObject\?\.\("trigger"/);
  assert.match(sidebar, /onInspectObject\?\.\("sequence"/);
  assert.match(sidebar, /onInspectObject\?\.\("index"/);
  assert.match(sidebar, /onInspectObject\?\.\("foreign_key"/);
});

test("inspection pane copy reflects the supported deep inspection matrix", async () => {
  const inspectionPane = await read(
    "client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx",
  );

  assert.match(
    inspectionPane,
    /functions\/procedures、triggers、PostgreSQL sequences、indexes 和 foreign keys/,
  );
  assert.match(inspectionPane, /Inspection coverage/);
  assert.match(inspectionPane, /Copy DDL/);
});

test("backend inspection dispatch covers real object families and driver-specific definition fetchers", async () => {
  const backend = await read(
    "src-tauri/src/db_connector/object_inspect.rs",
  );

  assert.match(backend, /DbObjectKind::Table/);
  assert.match(backend, /DbObjectKind::View/);
  assert.match(backend, /DbObjectKind::Index/);
  assert.match(backend, /DbObjectKind::ForeignKey/);
  assert.match(backend, /DbObjectKind::Function/);
  assert.match(backend, /DbObjectKind::Procedure/);
  assert.match(backend, /DbObjectKind::Trigger/);
  assert.match(backend, /DbObjectKind::Sequence/);
  assert.match(backend, /pg_catalog\.pg_get_functiondef/);
  assert.match(backend, /pg_catalog\.pg_get_triggerdef/);
  assert.match(backend, /\("FUNCTION", &\["Create Function"\]\)/);
  assert.match(backend, /\("PROCEDURE", &\["Create Procedure"\]\)/);
  assert.match(backend, /SHOW CREATE TRIGGER/);
  assert.match(backend, /pg_catalog\.pg_sequence/);
});
