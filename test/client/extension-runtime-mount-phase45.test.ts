import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("shared extension schema defines uiBundle and runtime view mount fields", async () => {
  const schema = await read("shared/extension-schema.ts");

  assert.match(schema, /extensionUiBundleSchema/);
  assert.match(schema, /uiBundle: extensionUiBundleSchema\.optional\(\)/);
  assert.match(schema, /runtimeViewId: z\.string\(\)\.optional\(\)/);
  assert.match(schema, /resolvedUiMountSchema/);
  assert.match(schema, /"ready"/);
  assert.match(schema, /"missing"/);
  assert.match(schema, /"invalid"/);
  assert.match(schema, /"incompatible"/);
});

test("backend exposes explicit runtime bundle status for installed extensions", async () => {
  const commands = await read("src-tauri/src/extensions/commands.rs");
  const lifecycle = await read("src-tauri/src/extensions/lifecycle.rs");
  const manifest = await read("src-tauri/src/extensions/manifest.rs");

  assert.match(commands, /pub struct ResolvedUiMount/);
  assert.match(commands, /status: String/);
  assert.match(commands, /entry_path: Option<String>/);
  assert.match(commands, /Runtime views were declared without a uiBundle/);
  assert.match(lifecycle, /UI バンドルエントリが存在しません/);
  assert.match(manifest, /pub ui_bundle: Option<UiBundle>/);
});

test("host shell contains iframe runtime fallbacks and asset-protocol wiring", async () => {
  const runtimeFrame = await read("client/src/extensions/ExtensionRuntimeFrame.tsx");
  const workspaceHost = await read("client/src/extensions/ExtensionWorkspaceHost.tsx");
  const secondarySidebar = await read("client/src/extensions/shell/ExtensionSecondarySidebar.tsx");
  const tauriConfig = await read("src-tauri/tauri.conf.json");

  assert.match(runtimeFrame, /convertFileSrc/);
  assert.match(runtimeFrame, /sandbox="allow-scripts allow-forms"/);
  assert.match(runtimeFrame, /This extension surface declared runtime UI, but no `uiBundle` was resolved/);
  assert.match(workspaceHost, /ExtensionRuntimeFrame/);
  assert.match(secondarySidebar, /activeSidebarView\?\.runtimeViewId/);
  assert.match(tauriConfig, /"assetProtocol"/);
  assert.match(tauriConfig, /\$APPDATA\/extensions\/\*\*/);
});
