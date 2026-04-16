import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { extractDesktopCheckpoints, normalizeUnknownError } from "../shared/desktop-runtime";
import type { SmokeCheckpoint } from "../shared/release-verification";

export interface DevCheckpointWaitOptions {
  logPath: string;
  requiredCheckpoints: readonly string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface DevCheckpointWaitResult {
  ready: boolean;
  checkpoints: SmokeCheckpoint[];
  missingCheckpoints: string[];
  elapsedMs: number;
}

export interface RunTauriDevVerificationOptions {
  cwd?: string;
  logPath: string;
  processLogPath: string;
  requiredCheckpoints: readonly string[];
  timeoutMs?: number;
  extraEnv?: Record<string, string | undefined>;
}

export interface RunTauriDevVerificationResult {
  ready: boolean;
  checkpoints: SmokeCheckpoint[];
  missingCheckpoints: string[];
  elapsedMs: number;
  logPath: string;
  processLogPath: string;
  exitedEarly: boolean;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toSmokeCheckpoints(logContents: string): SmokeCheckpoint[] {
  return extractDesktopCheckpoints(logContents).map((checkpoint) => ({
    name: checkpoint.name,
    metadata: checkpoint.metadata,
  }));
}

export async function waitForDevCheckpointEvidence(
  options: DevCheckpointWaitOptions,
): Promise<DevCheckpointWaitResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(options.logPath)) {
      const checkpoints = toSmokeCheckpoints(fs.readFileSync(options.logPath, "utf8"));
      const observed = new Set(checkpoints.map((checkpoint) => checkpoint.name));
      const missingCheckpoints = options.requiredCheckpoints.filter(
        (name) => !observed.has(name),
      );
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
    ? toSmokeCheckpoints(fs.readFileSync(options.logPath, "utf8"))
    : [];
  const observed = new Set(checkpoints.map((checkpoint) => checkpoint.name));
  return {
    ready: false,
    checkpoints,
    missingCheckpoints: options.requiredCheckpoints.filter((name) => !observed.has(name)),
    elapsedMs: Date.now() - startedAt,
  };
}

function readDevServerUrl(cwd: string): URL | null {
  try {
    const tauriConfigPath = path.join(cwd, "src-tauri", "tauri.conf.json");
    const config = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8")) as {
      build?: { devUrl?: string };
    };
    const devUrl = config.build?.devUrl?.trim();
    return devUrl ? new URL(devUrl) : null;
  } catch {
    return null;
  }
}

async function isTcpPortOpen(host: string, port: number): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };
      socket.setTimeout(1_000);
      socket.once("connect", () => {
        cleanup();
        resolve();
      });
      socket.once("timeout", () => {
        cleanup();
        reject(new Error("timeout"));
      });
      socket.once("error", (error) => {
        cleanup();
        reject(error);
      });
    });
    return true;
  } catch {
    return false;
  }
}

async function tauriDevCommand(
  cwd: string,
): Promise<{ command: string; args: string[] }> {
  const devServerUrl = readDevServerUrl(cwd);
  if (
    devServerUrl &&
    Number.isFinite(Number(devServerUrl.port)) &&
    (await isTcpPortOpen(
      devServerUrl.hostname || "127.0.0.1",
      Number(devServerUrl.port),
    ))
  ) {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          "cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --color always --",
        ],
      };
    }
    return {
      command: "cargo",
      args: [
        "run",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--no-default-features",
        "--color",
        "always",
        "--",
      ],
    };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm run tauri:dev"],
    };
  }
  return {
    command: "npm",
    args: ["run", "tauri:dev"],
  };
}

function cargoDevCommand(): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --color always --",
      ],
    };
  }
  return {
    command: "cargo",
    args: [
      "run",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--no-default-features",
      "--color",
      "always",
      "--",
    ],
  };
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number) {
  const exitPromise = once(child, "exit").then(([code, signal]) => ({
    timedOut: false,
    code: typeof code === "number" ? code : null,
    signal: (signal as NodeJS.Signals | null) ?? null,
  }));
  const timeoutPromise = new Promise<{
    timedOut: true;
    code: null;
    signal: null;
  }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true, code: null, signal: null }), timeoutMs);
  });
  return Promise.race([exitPromise, timeoutPromise]);
}

export async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForChildExit(killer, 5_000);
    return;
  }

  child.kill("SIGTERM");
  await waitForChildExit(child, 5_000);
}

export async function runTauriDevVerification(
  options: RunTauriDevVerificationOptions,
): Promise<RunTauriDevVerificationResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputDir = path.dirname(options.logPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(options.processLogPath), { recursive: true });
  fs.writeFileSync(options.logPath, "", "utf8");
  fs.writeFileSync(options.processLogPath, "", "utf8");
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      DBSCHEMA_SMOKE_LOG_PATH: options.logPath,
      DBSCHEMA_SMOKE_AUTO_OPEN_DB_WORKBENCH: "1",
      ...(options.extraEnv ?? {}),
    }).filter(([, value]) => value !== undefined),
  ) as NodeJS.ProcessEnv;
  const processLogStream = fs.createWriteStream(options.processLogPath, { flags: "a" });

  try {
    const runAttempt = async (
      command: { command: string; args: string[] },
    ): Promise<RunTauriDevVerificationResult> => {
      const child = spawn(command.command, command.args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let exitedEarly = false;
      let exitCode: number | null = null;
      let exitSignal: NodeJS.Signals | null = null;

      child.stdout?.on("data", (chunk) => processLogStream.write(chunk));
      child.stderr?.on("data", (chunk) => processLogStream.write(chunk));
      child.once("exit", (code, signal) => {
        exitedEarly = true;
        exitCode = typeof code === "number" ? code : null;
        exitSignal = (signal as NodeJS.Signals | null) ?? null;
      });
      child.once("error", (error) => {
        processLogStream.write(`${normalizeUnknownError(error)}\n`);
      });

      await once(child, "spawn");

      const waitResult = await waitForDevCheckpointEvidence({
        logPath: options.logPath,
        requiredCheckpoints: options.requiredCheckpoints,
        timeoutMs,
      });

      if (!exitedEarly) {
        await killProcessTree(child);
        exitedEarly = child.exitCode !== null || child.signalCode !== null;
        exitCode = child.exitCode;
        exitSignal = child.signalCode as NodeJS.Signals | null;
      }

      return {
        ...waitResult,
        logPath: options.logPath,
        processLogPath: options.processLogPath,
        exitedEarly,
        exitCode,
        exitSignal,
      };
    };

    let result = await runAttempt(await tauriDevCommand(cwd));
    const processLog = fs.readFileSync(options.processLogPath, "utf8");
    if (
      !result.ready &&
      /Port 5001 is already in use/i.test(processLog)
    ) {
      processLogStream.write(
        "\n[runner] beforeDevCommand failed because dev server is already running; retrying with cargo run only.\n",
      );
      result = await runAttempt(cargoDevCommand());
    }

    return result;
  } finally {
    processLogStream.end();
  }
}
