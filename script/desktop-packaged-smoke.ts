import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  buildDesktopSmokeArtifact,
  classifyDesktopSmokeFromCheckpoints,
  renderDesktopSmokeMarkdown,
} from "./desktop-smoke";
import {
  extractDesktopCheckpoints,
  normalizeUnknownError,
} from "../shared/desktop-runtime";
import type {
  DesktopSmokeArtifact,
  DesktopSmokeBlockerFinding,
  SmokeCheckpoint,
} from "../shared/release-verification";

export interface PackagedCheckpointWaitOptions {
  logPath: string;
  requiredCheckpoints?: readonly string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface PackagedCheckpointWaitResult {
  ready: boolean;
  checkpoints: SmokeCheckpoint[];
  missingCheckpoints: string[];
  elapsedMs: number;
}

export const PACKAGED_READY_CHECKPOINTS = [
  "tauri_setup_ready",
  "browser_window_loaded",
  "dashboard_ready",
  "db_workbench_surface_ready",
  "db_workbench_recovery_classified",
] as const;

function readTauriConfig(cwd = process.cwd()): { productName: string; version: string } {
  const tauriConfigPath = path.join(cwd, "src-tauri", "tauri.conf.json");
  const config = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8")) as {
    productName?: string;
    version?: string;
  };
  return {
    productName: config.productName?.trim() || "DBTools",
    version: config.version?.trim() || "unknown",
  };
}

export function resolvePackagedExecutablePath(cwd = process.cwd()): string {
  const releaseDir = path.join(cwd, "src-tauri", "target", "release");
  const { productName } = readTauriConfig(cwd);
  const preferredPath = path.join(releaseDir, `${productName}.exe`);
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const fallback = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".exe"))
    .sort((left, right) => right.name.localeCompare(left.name))
    .at(0);
  return fallback ? path.join(releaseDir, fallback.name) : preferredPath;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPackagedCheckpointEvidence(
  options: PackagedCheckpointWaitOptions,
): Promise<PackagedCheckpointWaitResult> {
  const requiredCheckpoints = [...(options.requiredCheckpoints ?? PACKAGED_READY_CHECKPOINTS)];
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(options.logPath)) {
      const checkpoints = extractDesktopCheckpoints(
        fs.readFileSync(options.logPath, "utf8"),
      ).map((checkpoint) => ({
        name: checkpoint.name,
        metadata: checkpoint.metadata,
      }));
      const observed = new Set(checkpoints.map((checkpoint) => checkpoint.name));
      const missingCheckpoints = requiredCheckpoints.filter((name) => !observed.has(name));
      if (missingCheckpoints.length === 0) {
        return {
          ready: true,
          checkpoints,
          missingCheckpoints,
          elapsedMs: Date.now() - startedAt,
        };
      }
    }

    await sleep(pollIntervalMs);
  }

  const checkpoints = fs.existsSync(options.logPath)
    ? extractDesktopCheckpoints(fs.readFileSync(options.logPath, "utf8")).map(
        (checkpoint) => ({
          name: checkpoint.name,
          metadata: checkpoint.metadata,
        }),
      )
    : [];
  const observed = new Set(checkpoints.map((checkpoint) => checkpoint.name));
  return {
    ready: false,
    checkpoints,
    missingCheckpoints: requiredCheckpoints.filter((name) => !observed.has(name)),
    elapsedMs: Date.now() - startedAt,
  };
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number) {
  const exitPromise = once(child, "exit").then(([code, signal]) => ({ timedOut: false, code, signal }));
  const timeoutPromise = new Promise<{ timedOut: true; code: null; signal: null }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true, code: null, signal: null }), timeoutMs);
  });
  return Promise.race([exitPromise, timeoutPromise]);
}

function buildFailureFinding(message: string): DesktopSmokeBlockerFinding {
  return {
    code: "PACKAGED_SMOKE_FAILED",
    blocker: true,
    severity: "critical",
    message,
  };
}

export async function runPackagedSmoke(cwd = process.cwd()): Promise<{
  artifact: DesktopSmokeArtifact;
  artifactJsonPath: string;
  artifactMarkdownPath: string;
}> {
  const executablePath = resolvePackagedExecutablePath(cwd);
  const now = new Date();
  const runId = `tauri-packaged-smoke-${now.toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = path.join(cwd, "artifacts", "release-verification");
  const logPath = path.join(outputDir, `${runId}.log`);
  fs.mkdirSync(outputDir, { recursive: true });

  const blockerFindings: DesktopSmokeBlockerFinding[] = [];
  let checkpoints: SmokeCheckpoint[] = [];

  if (!fs.existsSync(executablePath)) {
    blockerFindings.push(
      buildFailureFinding(`Packaged executable not found at ${executablePath}`),
    );
    const classified = classifyDesktopSmokeFromCheckpoints({ checkpoints });
    const artifact = buildDesktopSmokeArtifact({
      runId,
      generatedAt: now.toISOString(),
      appVersion: "unknown",
      environment: "packaged-tauri",
      executablePath,
      logPath,
      observedCheckpoints: checkpoints,
      recoveryClassification: classified.recoveryClassification,
      blockerFindings: [...blockerFindings, ...classified.blockerFindings],
      steps: classified.steps,
    });
    const artifactJsonPath = path.join(outputDir, `${runId}.json`);
    const artifactMarkdownPath = path.join(outputDir, `${runId}.md`);
    fs.writeFileSync(artifactJsonPath, JSON.stringify(artifact, null, 2), "utf8");
    fs.writeFileSync(artifactMarkdownPath, renderDesktopSmokeMarkdown(artifact), "utf8");
    return { artifact, artifactJsonPath, artifactMarkdownPath };
  }

  const child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      DBSCHEMA_SMOKE_LOG_PATH: logPath,
      DBSCHEMA_SMOKE_AUTO_OPEN_DB_WORKBENCH: "1",
    },
    stdio: "ignore",
    windowsHide: true,
  });

  try {
    await once(child, "spawn");
    const readiness = await waitForPackagedCheckpointEvidence({ logPath });
    checkpoints = readiness.checkpoints;
    if (!readiness.ready) {
      blockerFindings.push(
        buildFailureFinding(
          `Timed out waiting for packaged checkpoints: ${readiness.missingCheckpoints.join(", ")}`,
        ),
      );
    }
  } catch (error) {
    blockerFindings.push(buildFailureFinding(normalizeUnknownError(error)));
  } finally {
    child.kill();
    await waitForChildExit(child, 5_000);
  }

  const classified = classifyDesktopSmokeFromCheckpoints({ checkpoints });
  const artifact = buildDesktopSmokeArtifact({
    runId,
    generatedAt: now.toISOString(),
    appVersion: readTauriConfig(cwd).version,
    environment: "packaged-tauri",
    executablePath,
    logPath,
    observedCheckpoints: checkpoints,
    recoveryClassification: classified.recoveryClassification,
    blockerFindings: [...blockerFindings, ...classified.blockerFindings],
    steps: classified.steps,
  });

  const artifactJsonPath = path.join(outputDir, `${runId}.json`);
  const artifactMarkdownPath = path.join(outputDir, `${runId}.md`);
  fs.writeFileSync(artifactJsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(artifactMarkdownPath, renderDesktopSmokeMarkdown(artifact), "utf8");

  return { artifact, artifactJsonPath, artifactMarkdownPath };
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  runPackagedSmoke(process.cwd())
    .then(({ artifactJsonPath, artifactMarkdownPath }) => {
      console.log(`packaged smoke artifact written:\n- ${artifactJsonPath}\n- ${artifactMarkdownPath}`);
    })
    .catch((error) => {
      console.error(normalizeUnknownError(error));
      process.exit(1);
    });
}
