import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("install dialog presents metadata and progress in the same panel", async () => {
  const source = await read("client/src/components/extensions/ExtensionInstallDialog.tsx");

  assert.match(source, /版本/);
  assert.match(source, /大小/);
  assert.match(source, /兼容性/);
  assert.match(source, /更新摘要/);
  assert.match(source, /<Progress /);
  assert.match(source, /下载并安装/);
});

test("settings exposes dedicated extension management actions", async () => {
  const source = await read("client/src/components/settings/ExtensionManagementSection.tsx");

  assert.match(source, /扩展管理/);
  assert.match(source, /下载并安装/);
  assert.match(source, /检查更新/);
  assert.match(source, /卸载/);
});

test("dashboard wires install dialog into module entry flow", async () => {
  const source = await read("client/src/pages/Dashboard.tsx");

  assert.match(source, /<ExtensionInstallDialog/);
  assert.match(source, /onInstall=\{openOfficialExtensionFlow\}/);
  assert.match(source, /onRefreshCatalog=\{refreshOfficialExtensionCatalog\}/);
});

test("dashboard supports a local db management test mode without published official extension", async () => {
  const source = await read("client/src/pages/Dashboard.tsx");

  assert.match(source, /db-management-test/);
  assert.match(source, /const canBypassOfficialExtensionGate = isDesktopSmokeMode \|\| isDbManagementTestMode/);
  assert.match(source, /if \(!canBypassOfficialExtensionGate\) {\s*void refreshOfficialExtensionCatalog\(\);/);
  assert.match(source, /if \(canBypassOfficialExtensionGate\) {\s*setActiveModule\("db-management"\);/);
  assert.match(source, /\(dbManagementExtension\?\.status === "enabled" \|\| canBypassOfficialExtensionGate\)/);
  assert.match(source, /if \(canBypassOfficialExtensionGate\) {\s*return;\s*}\s*if \(dbManagementExtension\?\.status !== "enabled"\)/);
});
