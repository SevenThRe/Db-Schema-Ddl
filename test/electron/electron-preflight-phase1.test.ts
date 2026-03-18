import test from "node:test";
import assert from "node:assert/strict";
import {
  findMissingDdlCompatColumns,
  githubReleaseHasFriendlyCatalogFallback,
  packageScriptRunsDesktopPreflight,
  packageScriptRunsNodeNativeRebuild,
  runDesktopPreflight,
  scriptContainsRequiredElectronExternals,
} from "../../script/desktop-preflight";

test("build script keeps Electron native dependencies external", () => {
  assert.equal(
    scriptContainsRequiredElectronExternals('external: ["electron", "better-sqlite3"]'),
    true,
  );
});

test("ddl settings compat columns include the required reverse-import preference field", () => {
  assert.deepEqual(findMissingDdlCompatColumns(["ddl_import_template_preference"]), []);
});

test("release-critical package scripts include desktop preflight", () => {
  assert.equal(packageScriptRunsDesktopPreflight("npm run build && npm run preflight:desktop && electron ."), true);
  assert.equal(packageScriptRunsDesktopPreflight("npm run build && electron ."), false);
});

test("node test script restores the Node ABI for better-sqlite3 before running whitebox coverage", () => {
  assert.equal(packageScriptRunsNodeNativeRebuild("npm run rebuild:native:node && npm run test:behavior"), true);
  assert.equal(packageScriptRunsNodeNativeRebuild("npm run test:behavior"), false);
});

test("catalog fallback messaging remains user-friendly", () => {
  assert.equal(
    githubReleaseHasFriendlyCatalogFallback("throw new Error(\"官方扩展暂未发布，当前还没有可下载的安装包。\")"),
    true,
  );
});

test("desktop preflight succeeds against the current workspace", () => {
  const result = runDesktopPreflight(process.cwd());
  assert.equal(result.ok, true);
  assert.equal(result.checks.every((check) => check.ok), true);
});
