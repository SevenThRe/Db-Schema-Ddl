import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("host build no longer statically registers db-connector UI components", async () => {
  const registerAll = await read("client/src/extensions/builtin/register-all.tsx");
  const builtinManifest = await read("src-tauri/src/builtin_extensions/mod.rs");
  const dashboard = await read("client/src/pages/Dashboard.tsx");

  assert.doesNotMatch(registerAll, /DbConnectorWorkspace/);
  assert.doesNotMatch(registerAll, /DbConnectionsSidebarView/);
  assert.doesNotMatch(registerAll, /DbExplorerSidebarView/);
  assert.doesNotMatch(builtinManifest, /id: "db-connector"/);
  assert.doesNotMatch(dashboard, /extensionId: "db-connector"/);
  assert.doesNotMatch(dashboard, /workbenchViewId: "db-connector-workbench"/);
});

test("db-connector package scaffold declares runtime views and ui-only install metadata", async () => {
  const manifest = await read("extension-packages/db-connector/manifest.json");
  const schema = await read("shared/extension-schema.ts");
  const rustManifest = await read("src-tauri/src/extensions/manifest.rs");

  assert.match(manifest, /"id": "db-connector"/);
  assert.match(manifest, /"uiBundle"/);
  assert.match(manifest, /"db-connector\.sidebar\.connections"/);
  assert.match(manifest, /"db-connector\.sidebar\.explorer"/);
  assert.match(manifest, /"db-connector\.workbench\.main"/);
  assert.match(schema, /"db\.plan\.read"/);
  assert.match(schema, /"db\.result\.export"/);
  assert.match(schema, /"db\.data\.edit"/);
  assert.match(schema, /"db\.data\.sync"/);
  assert.match(rustManifest, /entry: Option<HashMap<String, String>>/);
});

test("runtime bridge and extracted app wire db-connector through host messaging", async () => {
  const runtimeFrame = await read("client/src/extensions/ExtensionRuntimeFrame.tsx");
  const bridge = await read("client/src/extensions/runtime/runtime-bridge.ts");
  const runtimeApp = await read("client/src/extensions/runtime/db-connector-extension-app.tsx");
  const buildScript = await read("script/build-db-connector-extension.ts");
  const viteConfig = await read("vite.config.ts");

  assert.match(runtimeFrame, /dispatchRuntimeHostCall/);
  assert.match(runtimeFrame, /type === "host-call"/);
  assert.match(runtimeFrame, /type === "navigation"/);
  assert.match(bridge, /postMessage/);
  assert.match(runtimeApp, /DbConnectorWorkspace/);
  assert.match(runtimeApp, /DbConnectionsSidebarView/);
  assert.match(runtimeApp, /DbExplorerSidebarView/);
  assert.match(runtimeApp, /ExtensionHostStaticProvider/);
  assert.match(buildScript, /mode: "db-connector-extension"/);
  assert.match(viteConfig, /db-connector-extension/);
});
