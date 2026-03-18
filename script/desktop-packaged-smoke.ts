import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  buildDesktopSmokeArtifact,
  createDesktopSmokeChecklist,
  renderDesktopSmokeMarkdown,
  DESKTOP_SMOKE_STEP_IDS,
} from "./desktop-smoke";
import { normalizeUnknownError } from "../shared/desktop-runtime";
import type {
  DesktopSmokeArtifact,
  DesktopSmokeBlockerFinding,
  DesktopSmokeLogExcerpt,
} from "../shared/schema";

export const PACKAGED_EXECUTABLE_NAME = "DBSchemaExcel2DDL.exe";
export const PACKAGED_READY_CHECKPOINTS = [
  "server_bootstrap_ready",
  "browser_window_loaded",
] as const;

const PACKAGED_RUN_MODE = "packaged-win-unpacked";

export type PackagedSmokeFailureStage = "launch" | "readiness" | "shutdown";

export interface PackagedCheckpointWaitOptions {
  logPath: string;
  requiredCheckpoints?: readonly string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
  existsSync?: (targetPath: string) => boolean;
  readFile?: (targetPath: string) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
}

export interface PackagedCheckpointWaitResult {
  ready: boolean;
  observedCheckpoints: string[];
  missingCheckpoints: string[];
  attempts: number;
  elapsedMs: number;
}

export interface PackagedSmokeResult {
  artifact: DesktopSmokeArtifact;
  artifactJsonPath: string;
  artifactMarkdownPath: string;
}

export function resolvePackagedExecutablePath(cwd = process.cwd()): string {
  return path.join(cwd, "dist-electron", "win-unpacked", PACKAGED_EXECUTABLE_NAME);
}

export function buildPackagedSmokeFailureFinding(
  stage: PackagedSmokeFailureStage,
  error: unknown,
): DesktopSmokeBlockerFinding {
  const message = normalizeUnknownError(error);
  const stageLabel =
    stage === "launch" ? "launch" : stage === "readiness" ? "readiness" : "shutdown";

  return {
    code: `PACKAGED_${stage.toUpperCase()}_FAILED`,
    blocker: true,
    severity: "critical",
    message: `Packaged ${stageLabel} failed: ${message}`,
  };
}

export function extractPackagedCheckpointNames(logContents: string): string[] {
  const checkpoints = new Set<string>();
  const matches = logContents.matchAll(/^\[checkpoint:([^\]]+)\]/gm);
  for (const match of matches) {
    if (match[1]) {
      checkpoints.add(match[1]);
    }
  }
  return [...checkpoints];
}

export async function waitForPackagedCheckpointEvidence(
  options: PackagedCheckpointWaitOptions,
): Promise<PackagedCheckpointWaitResult> {
  const requiredCheckpoints = [...(options.requiredCheckpoints ?? PACKAGED_READY_CHECKPOINTS)];
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const existsSync = options.existsSync ?? fs.existsSync;
  const readFile =
    options.readFile ??
    (async (targetPath: string) => fs.promises.readFile(targetPath, "utf8"));
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let observedCheckpoints: string[] = [];

  while (Date.now() <= deadline) {
    attempts += 1;

    if (existsSync(options.logPath)) {
      observedCheckpoints = extractPackagedCheckpointNames(await readFile(options.logPath));
      const observedSet = new Set(observedCheckpoints);
      const missingCheckpoints = requiredCheckpoints.filter((name) => !observedSet.has(name));
      if (missingCheckpoints.length === 0) {
        return {
          ready: true,
          observedCheckpoints,
          missingCheckpoints,
          attempts,
          elapsedMs: Math.max(0, timeoutMs - Math.max(0, deadline - Date.now())),
        };
      }
    }

    if (Date.now() >= deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  const observedSet = new Set(observedCheckpoints);
  return {
    ready: false,
    observedCheckpoints,
    missingCheckpoints: requiredCheckpoints.filter((name) => !observedSet.has(name)),
    attempts,
    elapsedMs: timeoutMs,
  };
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number) {
  const exitPromise = once(child, "exit").then(([code, signal]) => ({
    timedOut: false,
    code,
    signal,
  }));
  const timeoutPromise = new Promise<{ timedOut: true; code: null; signal: null }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true, code: null, signal: null }), timeoutMs);
  });

  return Promise.race([exitPromise, timeoutPromise]);
}

function ensureDirectory(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function createPackagedSmokeRunId(now: Date) {
  return `desktop-smoke-${PACKAGED_RUN_MODE}-${now.toISOString().replace(/[:.]/g, "-")}`;
}

function readLogExcerpt(logPath: string, maxLines = 40): DesktopSmokeLogExcerpt | undefined {
  if (!fs.existsSync(logPath)) {
    return undefined;
  }

  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return undefined;
  }

  const excerptLines = lines.slice(-maxLines);
  const startLine = Math.max(1, lines.length - excerptLines.length + 1);
  return {
    path: logPath,
    excerpt: excerptLines.join("\n"),
    startLine,
    endLine: lines.length,
  };
}

function updateSmokeStep(
  artifact: DesktopSmokeArtifact,
  stepId: string,
  status: "passed" | "failed" | "warning" | "skipped",
  detail: string,
) {
  const step = artifact.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    return;
  }

  step.status = status;
  step.detail = detail;
}

async function spawnPackagedExecutable(executablePath: string, env: NodeJS.ProcessEnv) {
  const child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    env,
    stdio: "ignore",
    windowsHide: true,
  });

  const launchState = await Promise.race([
    once(child, "spawn").then(() => ({ ok: true as const })),
    once(child, "error").then(([error]) => ({ ok: false as const, error })),
  ]);

  if (!launchState.ok) {
    throw launchState.error;
  }

  return child;
}

export async function runPackagedSmoke(cwd = process.cwd()): Promise<PackagedSmokeResult> {
  const now = new Date();
  const runId = createPackagedSmokeRunId(now);
  const outputDir = path.join(cwd, "artifacts", "desktop-smoke");
  ensureDirectory(outputDir);

  const logPath = path.join(outputDir, `${runId}.bootstrap.log`);
  const screenshotPath = path.join(outputDir, `${runId}.png`);
  const artifactJsonPath = path.join(outputDir, `${runId}.json`);
  const artifactMarkdownPath = path.join(outputDir, `${runId}.md`);
  const executablePath = resolvePackagedExecutablePath(cwd);
  const blockerFindings: DesktopSmokeBlockerFinding[] = [];

  const artifact = buildDesktopSmokeArtifact({
    runId,
    generatedAt: now.toISOString(),
    appVersion: "packaged-smoke",
    environment: "packaged-electron",
    runMode: PACKAGED_RUN_MODE,
    executablePath,
    logPath,
    screenshotPaths: [],
    steps: createDesktopSmokeChecklist(),
    blockerFindings,
  });

  if (!fs.existsSync(executablePath)) {
    blockerFindings.push(
      buildPackagedSmokeFailureFinding(
        "launch",
        `Packaged executable was not found at ${executablePath}. Run npm run build:electron first.`,
      ),
    );
    updateSmokeStep(artifact, DESKTOP_SMOKE_STEP_IDS.startup, "failed", blockerFindings[0].message);
    updateSmokeStep(
      artifact,
      DESKTOP_SMOKE_STEP_IDS.shutdown,
      "skipped",
      "Packaged app never launched, so shutdown could not be observed.",
    );
  } else {
    let child: ChildProcess | undefined;

    try {
      try {
        fs.rmSync(logPath, { force: true });
      } catch {
        // Ignore old log cleanup failures and let the fresh run overwrite if possible.
      }

      child = await spawnPackagedExecutable(executablePath, {
        ...process.env,
        DBSCHEMA_SMOKE_MODE: "1",
        DBSCHEMA_SMOKE_LOG_PATH: logPath,
        DBSCHEMA_SMOKE_SCREENSHOT_PATH: screenshotPath,
        DBSCHEMA_SMOKE_AUTO_CLOSE_MS: "1500",
      });
    } catch (error) {
      blockerFindings.push(buildPackagedSmokeFailureFinding("launch", error));
      updateSmokeStep(artifact, DESKTOP_SMOKE_STEP_IDS.startup, "failed", blockerFindings[0].message);
      updateSmokeStep(
        artifact,
        DESKTOP_SMOKE_STEP_IDS.shutdown,
        "skipped",
        "Packaged app never launched, so shutdown could not be observed.",
      );
    }

    if (child) {
      const readiness = await waitForPackagedCheckpointEvidence({
        logPath,
        timeoutMs: 60_000,
        pollIntervalMs: 500,
      });

      if (!readiness.ready) {
        const finding = buildPackagedSmokeFailureFinding(
          "readiness",
          `Timed out waiting for checkpoints: ${readiness.missingCheckpoints.join(", ") || "unknown"}`,
        );
        blockerFindings.push(finding);
        updateSmokeStep(artifact, DESKTOP_SMOKE_STEP_IDS.startup, "failed", finding.message);
      } else {
        updateSmokeStep(
          artifact,
          DESKTOP_SMOKE_STEP_IDS.startup,
          "passed",
          `Observed checkpoints: ${readiness.observedCheckpoints.join(", ")}`,
        );
        if (fs.existsSync(screenshotPath)) {
          artifact.screenshotPaths.push(screenshotPath);
        }
      }

      const exitResult = await waitForChildExit(child, 20_000);
      if (exitResult.timedOut) {
        child.kill();
        const finding = buildPackagedSmokeFailureFinding(
          "shutdown",
          "Timed out waiting for packaged app to exit after smoke-mode auto-close.",
        );
        blockerFindings.push(finding);
        updateSmokeStep(artifact, DESKTOP_SMOKE_STEP_IDS.shutdown, "failed", finding.message);
      } else if (exitResult.code !== 0) {
        const finding = buildPackagedSmokeFailureFinding(
          "shutdown",
          `Packaged app exited with code ${String(exitResult.code)}`,
        );
        blockerFindings.push(finding);
        updateSmokeStep(artifact, DESKTOP_SMOKE_STEP_IDS.shutdown, "failed", finding.message);
      } else {
        updateSmokeStep(
          artifact,
          DESKTOP_SMOKE_STEP_IDS.shutdown,
          "passed",
          "Packaged app exited cleanly after smoke-mode auto-close.",
        );
      }
    }
  }

  artifact.logExcerpt = readLogExcerpt(logPath);
  artifact.blockerFindings = blockerFindings;
  artifact.summary = {
    ...artifact.summary,
    ...{
      passedCount: artifact.steps.filter((step) => step.status === "passed").length,
      failedCount: artifact.steps.filter((step) => step.status === "failed").length,
      warningCount: artifact.steps.filter((step) => step.status === "warning").length,
      skippedCount: artifact.steps.filter((step) => step.status === "skipped").length,
      overallStatus: artifact.steps.some((step) => step.status === "failed")
        ? "failed"
        : artifact.steps.some((step) => step.status === "warning" || step.status === "skipped")
          ? "warning"
          : "passed",
    },
  };

  fs.writeFileSync(artifactJsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(artifactMarkdownPath, renderDesktopSmokeMarkdown(artifact), "utf8");

  return {
    artifact,
    artifactJsonPath,
    artifactMarkdownPath,
  };
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  const result = await runPackagedSmoke(process.cwd());
  console.log(
    [
      `packaged smoke artifact written:`,
      `- ${result.artifactJsonPath}`,
      `- ${result.artifactMarkdownPath}`,
      `- status: ${result.artifact.summary.overallStatus}`,
    ].join("\n"),
  );

  if (result.artifact.blockerFindings.some((finding) => finding.blocker)) {
    process.exitCode = 1;
  }
}
