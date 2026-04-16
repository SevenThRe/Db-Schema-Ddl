import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_VERIFICATION_SCRIPTS = [
  "verify:desktop:preflight",
  "verify:desktop:smoke",
  "verify:desktop:smoke:packaged",
  "verify:desktop:live",
  "verify:desktop:ship-gate",
] as const;

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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function runDesktopPreflight(cwd = process.cwd()): DesktopPreflightResult {
  const packageJsonPath = path.join(cwd, "package.json");
  const tauriConfigPath = path.join(cwd, "src-tauri", "tauri.conf.json");
  const tauriLibPath = path.join(cwd, "src-tauri", "src", "lib.rs");
  const commandsPath = path.join(cwd, "src-tauri", "src", "commands.rs");
  const dashboardPath = path.join(cwd, "client", "src", "pages", "Dashboard.tsx");
  const workspacePath = path.join(
    cwd,
    "client",
    "src",
    "components",
    "extensions",
    "DbConnectorWorkspace.tsx",
  );

  const pkg = readJson<{ scripts?: Record<string, string> }>(packageJsonPath);
  const tauriConfig = readJson<{
    productName?: string;
    bundle?: { active?: boolean; targets?: string | string[] };
  }>(tauriConfigPath);
  const libSource = fs.readFileSync(tauriLibPath, "utf8");
  const commandSource = fs.readFileSync(commandsPath, "utf8");
  const dashboardSource = fs.readFileSync(dashboardPath, "utf8");
  const workspaceSource = fs.readFileSync(workspacePath, "utf8");

  const checks: DesktopPreflightCheck[] = [];

  const missingScripts = REQUIRED_VERIFICATION_SCRIPTS.filter(
    (name) => typeof pkg.scripts?.[name] !== "string",
  );
  checks.push({
    id: "tauri-verification-scripts",
    ok: missingScripts.length === 0,
    message: "Package scripts must expose the canonical Tauri release-verification commands.",
    detail:
      missingScripts.length > 0
        ? `Missing scripts: ${missingScripts.join(", ")}`
        : undefined,
  });

  const bundleTargets = Array.isArray(tauriConfig.bundle?.targets)
    ? tauriConfig.bundle?.targets
    : [tauriConfig.bundle?.targets].filter(Boolean);
  checks.push({
    id: "tauri-bundle-config",
    ok:
      tauriConfig.bundle?.active === true &&
      bundleTargets.some((target) => target === "nsis") &&
      typeof tauriConfig.productName === "string" &&
      tauriConfig.productName.trim().length > 0,
    message: "Tauri bundle config must remain active with an NSIS target and a stable product name.",
    detail: `productName=${tauriConfig.productName ?? "missing"}, targets=${bundleTargets.join(", ") || "missing"}`,
  });

  checks.push({
    id: "smoke-checkpoint-command",
    ok:
      commandSource.includes("pub fn emit_smoke_checkpoint") &&
      commandSource.includes("pub fn core_smoke_checkpoint") &&
      libSource.includes("commands::core_smoke_checkpoint"),
    message: "The runtime must expose a canonical smoke checkpoint command for release verification.",
  });

  checks.push({
    id: "frontend-smoke-entry",
    ok:
      dashboardSource.includes("readReleaseVerificationConfig") &&
      dashboardSource.includes('extensionId: "db-connector"') &&
      workspaceSource.includes("db_workbench_surface_ready") &&
      workspaceSource.includes("db_workbench_recovery_classified"),
    message: "Dashboard and DB workspace must emit real Tauri smoke checkpoints for workspace entry and recovery.",
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
