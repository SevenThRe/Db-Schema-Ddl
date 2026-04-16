import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildDesktopSmokeArtifact,
  classifyDesktopSmokeFromCheckpoints,
  renderDesktopSmokeMarkdown,
} from "./desktop-smoke";
import { runTauriDevVerification } from "./tauri-dev-runtime";
import type { DesktopSmokeBlockerFinding } from "../shared/release-verification";

export const DEV_TAURI_READY_CHECKPOINTS = [
  "tauri_setup_ready",
  "browser_window_loaded",
  "dashboard_ready",
  "db_workbench_surface_ready",
  "db_workbench_recovery_classified",
] as const;

function readTauriVersion(cwd = process.cwd()): string {
  const tauriConfigPath = path.join(cwd, "src-tauri", "tauri.conf.json");
  const config = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8")) as {
    version?: string;
  };
  return config.version?.trim() || "manual";
}

function parseTimeoutMs(): number | undefined {
  const arg = process.argv.find((entry) => entry.startsWith("--timeout-ms="));
  if (!arg) {
    return undefined;
  }
  const timeout = Number(arg.slice("--timeout-ms=".length));
  return Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
}

function buildFailureFinding(message: string): DesktopSmokeBlockerFinding {
  return {
    code: "DEV_TAURI_SMOKE_FAILED",
    blocker: true,
    severity: "critical",
    message,
  };
}

export async function runDevTauriSmoke(cwd = process.cwd()) {
  const now = new Date();
  const runId = `tauri-smoke-dev-tauri-${now.toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = path.join(cwd, "artifacts", "release-verification");
  const logPath = path.join(outputDir, `${runId}.log`);
  const processLogPath = path.join(outputDir, `${runId}.process.log`);
  const timeoutMs = parseTimeoutMs();

  const runtime = await runTauriDevVerification({
    cwd,
    logPath,
    processLogPath,
    requiredCheckpoints: DEV_TAURI_READY_CHECKPOINTS,
    timeoutMs,
  });

  const blockerFindings: DesktopSmokeBlockerFinding[] = [];
  if (!runtime.ready) {
    blockerFindings.push(
      buildFailureFinding(
        runtime.exitedEarly
          ? `tauri dev exited before readiness checkpoints were complete. Missing: ${runtime.missingCheckpoints.join(", ")}`
          : `Timed out waiting for dev-tauri checkpoints: ${runtime.missingCheckpoints.join(", ")}`,
      ),
    );
  }

  const classified = classifyDesktopSmokeFromCheckpoints({
    checkpoints: runtime.checkpoints,
  });
  const artifact = buildDesktopSmokeArtifact({
    runId,
    generatedAt: now.toISOString(),
    appVersion: readTauriVersion(cwd),
    environment: "dev-tauri",
    runMode: "dev-tauri",
    logPath,
    observedCheckpoints: runtime.checkpoints,
    recoveryClassification: classified.recoveryClassification,
    blockerFindings: [...blockerFindings, ...classified.blockerFindings],
    steps: classified.steps,
  });

  const artifactJsonPath = path.join(outputDir, `${runId}.json`);
  const artifactMarkdownPath = path.join(outputDir, `${runId}.md`);
  fs.writeFileSync(artifactJsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(artifactMarkdownPath, renderDesktopSmokeMarkdown(artifact), "utf8");

  return {
    artifact,
    artifactJsonPath,
    artifactMarkdownPath,
    processLogPath,
  };
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  runDevTauriSmoke(process.cwd())
    .then(({ artifactJsonPath, artifactMarkdownPath, processLogPath }) => {
      console.log(
        `dev-tauri smoke artifact written:\n- ${artifactJsonPath}\n- ${artifactMarkdownPath}\n- ${processLogPath}`,
      );
    })
    .catch((error) => {
      console.error(String(error));
      process.exit(1);
    });
}
