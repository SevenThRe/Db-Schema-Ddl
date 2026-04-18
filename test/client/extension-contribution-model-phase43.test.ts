import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("shared extension schema defines canonical shell contribution fields", async () => {
  const schema = await read("shared/extension-schema.ts");

  assert.match(schema, /activityBarItemSchema/);
  assert.match(schema, /sidebarViewSchema/);
  assert.match(schema, /workbenchViewSchema/);
  assert.match(schema, /defaultSidebarViewId/);
  assert.match(schema, /defaultWorkbenchViewId/);
  assert.match(schema, /activityBar: z\.array/);
  assert.match(schema, /sidebarViews: z\.array/);
  assert.match(schema, /workbenchViews: z\.array/);
});

test("frontend host resolves canonical shell collections and workbench routing ids", async () => {
  const resolver = await read("client/src/extensions/contribution-resolver.ts");
  const hostContext = await read("client/src/extensions/host-context.tsx");
  const hostApi = await read("client/src/extensions/host-api.ts");
  const workspaceHost = await read("client/src/extensions/ExtensionWorkspaceHost.tsx");

  assert.match(resolver, /resolveActivityBarItems/);
  assert.match(resolver, /resolveSidebarViews/);
  assert.match(resolver, /resolveWorkbenchViews/);
  assert.match(hostContext, /activityBarItems/);
  assert.match(hostContext, /sidebarViews/);
  assert.match(hostContext, /workbenchViews/);
  assert.match(hostApi, /activityItemId\?: string/);
  assert.match(hostApi, /workbenchViewId\?: string/);
  assert.match(workspaceHost, /workbenchViewId/);
});
