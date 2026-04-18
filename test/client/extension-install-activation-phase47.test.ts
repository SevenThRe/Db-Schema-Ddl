import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("backend lifecycle truth clears stale disabled state on install and uninstall", async () => {
  const commands = await read("src-tauri/src/extensions/commands.rs");

  assert.match(commands, /fn apply_enabled_state/);
  assert.match(commands, /ext_install[\s\S]*apply_enabled_state\(&mut state, &id, true\)/);
  assert.match(commands, /ext_uninstall[\s\S]*apply_enabled_state\(&mut state, &id, true\)/);
});

test("useExtensions exposes canonical enablement mutation and invalidates shell queries", async () => {
  const hook = await read("client/src/hooks/use-extensions.ts");

  assert.match(hook, /const RESOLVED_EXTENSIONS_KEY = \["extensions", "all"\]/);
  assert.match(hook, /const setEnabledMutation = useMutation/);
  assert.match(hook, /invoke<void>\("ext_set_enabled", \{ id, enabled \}\)/);
  assert.match(hook, /setEnabled: \(id: string, enabled: boolean\) => setEnabledMutation\.mutateAsync/);
});

test("reachable extension management page now installs and manages official extensions", async () => {
  const page = await read("client/src/components/extension-management/ExtensionManagementPage.tsx");

  assert.match(page, /const OFFICIAL_EXTENSION_IDS: readonly string\[] = \["db-connector"\]/);
  assert.match(page, /await install\(id\)/);
  assert.match(page, /await setEnabled\(id, enabled\)/);
  assert.match(page, /await uninstall\(id\)/);
  assert.match(page, /onNavigate\?\.\(surface\)/);
  assert.match(page, /extensions\.status\./);
  assert.match(page, /extensions\.button\.enable/);
  assert.match(page, /extensions\.button\.disable/);
});

test("dashboard falls back to workspace when the active extension no longer resolves", async () => {
  const dashboard = await read("client/src/pages/Dashboard.tsx");

  assert.match(
    dashboard,
    /if \(activeSurface\.kind !== "extension" \|\| isExtensionHostLoading \|\| activeExtensionActivity\) \{\s*return;\s*\}\s*setActiveSurface\(\{ kind: "workspace" \}\);/,
  );
});
