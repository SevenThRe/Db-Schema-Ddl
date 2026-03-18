import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sidebar upload entry becomes an action menu with template creation flow", async () => {
  const sidebar = await read("client/src/components/Sidebar.tsx");
  const dialog = await read("client/src/components/templates/TemplateCreateDialog.tsx");

  assert.match(sidebar, /DropdownMenu/);
  assert.match(sidebar, /从模板创建/);
  assert.match(sidebar, /TemplateCreateDialog/);
  assert.match(sidebar, /useWorkbookTemplates/);
  assert.match(sidebar, /useCreateWorkbookFromTemplate/);

  assert.match(dialog, /round-trip 自检/);
  assert.match(dialog, /Format \{template\.parserFormat\}/);
  assert.match(dialog, /创建模板文件/);
});

test("shared file contracts expose template catalog and create-from-template APIs", async () => {
  const schema = await read("shared/schema.ts");
  const routes = await read("shared/routes.ts");
  const hooks = await read("client/src/hooks/use-ddl.ts");

  assert.match(schema, /workbookTemplateVariantSchema/);
  assert.match(schema, /createWorkbookFromTemplateRequestSchema/);
  assert.match(schema, /createWorkbookFromTemplateResponseSchema/);

  assert.match(routes, /listTemplates:/);
  assert.match(routes, /createFromTemplate:/);

  assert.match(hooks, /useWorkbookTemplates/);
  assert.match(hooks, /useCreateWorkbookFromTemplate/);
});
