import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DDL_SETTINGS_COMPAT_COLUMNS } from "../server/constants/db-init";

const REQUIRED_DESKTOP_EXTERNALS = ["electron", "better-sqlite3"] as const;
const REQUIRED_PACKAGE_SCRIPTS = ["start:electron", "build:electron", "release"] as const;
const FRIENDLY_CATALOG_FALLBACK = "官方扩展暂未发布，当前还没有可下载的安装包。";
const PACKAGED_SMOKE_SCRIPT = "smoke:packaged";

export interface DesktopPreflightCheck {
  id: string;
  ok: boolean;
  message: string;
  detail?: string;
}

export interface DesktopPreflightResult {
  ok: boolean;
  checks: DesktopPreflightCheck[];
}

export function scriptContainsRequiredElectronExternals(buildScriptSource: string): boolean {
  return REQUIRED_DESKTOP_EXTERNALS.every((name) =>
    buildScriptSource.includes(`"${name}"`) || buildScriptSource.includes(`'${name}'`),
  );
}

export function findMissingDdlCompatColumns(columnNames: string[]): string[] {
  const declared = new Set(DDL_SETTINGS_COMPAT_COLUMNS.map((column) => column.name));
  return columnNames.filter((name) => !declared.has(name));
}

export function packageScriptRunsDesktopPreflight(scriptValue: string | undefined): boolean {
  return typeof scriptValue === "string" && scriptValue.includes("preflight:desktop");
}

export function packageScriptRunsNodeNativeRebuild(scriptValue: string | undefined): boolean {
  return typeof scriptValue === "string" && scriptValue.includes("rebuild:native:node");
}

export function packageScriptRunsElectronNativeBuild(scriptValue: string | undefined): boolean {
  return (
    typeof scriptValue === "string" &&
    (scriptValue.includes("build:electron") || scriptValue.includes("rebuild:native:electron"))
  );
}

export function packagedSmokeScriptPreservesElectronNativeAbi(scriptValue: string | undefined): boolean {
  return packageScriptRunsElectronNativeBuild(scriptValue) && !packageScriptRunsNodeNativeRebuild(scriptValue);
}

export function githubReleaseHasFriendlyCatalogFallback(source: string): boolean {
  return source.includes(FRIENDLY_CATALOG_FALLBACK);
}

export function runDesktopPreflight(cwd = process.cwd()): DesktopPreflightResult {
  const packageJsonPath = path.join(cwd, "package.json");
  const buildScriptPath = path.join(cwd, "script", "build.ts");
  const githubReleasePath = path.join(cwd, "electron", "github-release.ts");

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const buildScriptSource = fs.readFileSync(buildScriptPath, "utf8");
  const githubReleaseSource = fs.readFileSync(githubReleasePath, "utf8");

  const checks: DesktopPreflightCheck[] = [];

  checks.push({
    id: "electron-bundle-externals",
    ok: scriptContainsRequiredElectronExternals(buildScriptSource),
    message: "Electron build must keep native desktop modules external.",
    detail: `Required externals: ${REQUIRED_DESKTOP_EXTERNALS.join(", ")}`,
  });

  const missingCompatColumns = findMissingDdlCompatColumns(["ddl_import_template_preference"]);
  checks.push({
    id: "ddl-settings-compat-columns",
    ok: missingCompatColumns.length === 0,
    message: "SQLite compatibility migration must include required ddl_settings columns.",
    detail: missingCompatColumns.length > 0 ? `Missing: ${missingCompatColumns.join(", ")}` : undefined,
  });

  const scriptFailures = REQUIRED_PACKAGE_SCRIPTS.filter(
    (scriptName) => !packageScriptRunsDesktopPreflight(pkg.scripts?.[scriptName]),
  );
  checks.push({
    id: "desktop-preflight-hooked-into-scripts",
    ok: scriptFailures.length === 0,
    message: "Desktop preflight must run from release-critical npm scripts.",
    detail: scriptFailures.length > 0 ? `Missing preflight hook in: ${scriptFailures.join(", ")}` : undefined,
  });

  checks.push({
    id: "node-native-rebuild-hooked-into-tests",
    ok: packageScriptRunsNodeNativeRebuild(pkg.scripts?.test),
    message: "Node-side test runs must restore better-sqlite3 to the active Node ABI.",
    detail: packageScriptRunsNodeNativeRebuild(pkg.scripts?.test)
      ? undefined
      : "Add rebuild:native:node to the npm test pipeline.",
  });

  const packagedSmokeScript = pkg.scripts?.[PACKAGED_SMOKE_SCRIPT];
  checks.push({
    id: "packaged-smoke-keeps-electron-native-abi",
    ok: packagedSmokeScriptPreservesElectronNativeAbi(packagedSmokeScript),
    message: "Packaged smoke must reuse the Electron-native build path and avoid the Node ABI rebuild path.",
    detail:
      typeof packagedSmokeScript === "string"
        ? `Current script must include build:electron or rebuild:native:electron and must not include rebuild:native:node.`
        : `Add ${PACKAGED_SMOKE_SCRIPT} and route it through build:electron or rebuild:native:electron.`,
  });

  checks.push({
    id: "friendly-catalog-fallback",
    ok: githubReleaseHasFriendlyCatalogFallback(githubReleaseSource),
    message: "Official extension catalog fallback should stay user-friendly.",
  });

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function printResult(result: DesktopPreflightResult) {
  if (result.ok) {
    console.log("desktop preflight passed");
    return;
  }

  console.error("desktop preflight failed");
  for (const check of result.checks.filter((item) => !item.ok)) {
    console.error(`- ${check.id}: ${check.detail ?? check.message}`);
  }
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  const result = runDesktopPreflight();
  printResult(result);
  if (!result.ok) {
    process.exit(1);
  }
}
