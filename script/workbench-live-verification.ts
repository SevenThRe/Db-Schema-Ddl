import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  liveVerificationPrereqCheckSchema,
  liveVerificationFlowIdSchema,
  liveVerificationFlowSchema,
  workbenchLiveVerificationPrereqArtifactSchema,
  type LiveVerificationPrereqCheck,
  workbenchLiveVerificationArtifactSchema,
  type LiveVerificationFlow,
  type WorkbenchLiveVerificationPrereqArtifact,
  type WorkbenchLiveVerificationArtifact,
} from "../shared/release-verification";
import { extractDesktopCheckpoints } from "../shared/desktop-runtime";
import { buildReleaseVerificationBootstrapConfig } from "../client/src/lib/db-connection-string";
import { resolveDbLabConnections } from "./db-lab-preflight";
import { DEV_TAURI_READY_CHECKPOINTS } from "./desktop-dev-smoke";
import { runTauriDevVerification } from "./tauri-dev-runtime";

const REQUIRED_FLOW_IDS = liveVerificationFlowIdSchema.options;
const LIVE_COMPLETED_CHECKPOINT = "db_workbench_live_completed";

function summarizeFlows(flows: LiveVerificationFlow[]) {
  return summarizeStatuses(flows);
}

function summarizeStatuses(
  items: Array<{ status: "passed" | "failed" | "warning" | "skipped" }>,
) {
  const passedCount = items.filter((item) => item.status === "passed").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const warningCount = items.filter((item) => item.status === "warning").length;
  const skippedCount = items.filter((item) => item.status === "skipped").length;

  return {
    passedCount,
    failedCount,
    warningCount,
    skippedCount,
    overallStatus:
      failedCount > 0 ? "failed" : warningCount > 0 || skippedCount > 0 ? "warning" : "passed",
  } as const;
}

function parseArgValue(name: string, aliases: string[] = []): string | undefined {
  const allNames = [name, ...aliases];
  for (const candidate of allNames) {
    const prefix = `--${candidate}=`;
    const direct = process.argv.find((arg) => arg.startsWith(prefix));
    if (direct) {
      return direct.slice(prefix.length);
    }
  }

  return undefined;
}

function parseDriverArg(): "mysql" | "postgres" {
  const driver = parseArgValue("driver");
  return driver === "postgres" ? "postgres" : "mysql";
}

function parseTimeoutMs(): number | undefined {
  const value = parseArgValue("timeout-ms");
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBooleanArg(name: string): boolean | undefined {
  if (process.argv.includes(`--${name}`)) {
    return true;
  }

  const value = parseArgValue(name);
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function hasArg(name: string): boolean {
  return process.argv.some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
}

export function resolveLiveVerificationTargetArgs(input: {
  driver: "mysql" | "postgres";
  connectionString?: string;
  defaultSchema?: string;
  lab?: boolean;
  env?: NodeJS.ProcessEnv;
}): {
  connectionString?: string;
  defaultSchema?: string;
} {
  if (!input.lab || input.connectionString) {
    return {
      connectionString: input.connectionString,
      defaultSchema: input.defaultSchema,
    };
  }

  const labConnections = resolveDbLabConnections(input.env ?? process.env);
  return {
    connectionString:
      input.driver === "postgres"
        ? labConnections.postgresConnection
        : labConnections.mysqlConnection,
    defaultSchema:
      input.driver === "postgres"
        ? input.defaultSchema ?? "app"
        : input.defaultSchema,
  };
}

export function buildLiveVerificationEnvOverrides(input: {
  driver: "mysql" | "postgres";
  connectionId?: string;
  connectionName?: string;
  connectionString?: string;
  readonly?: boolean;
  defaultSchema?: string;
}): Record<string, string | undefined> {
  return {
    DBSCHEMA_LIVE_VERIFY_ENABLED: "1",
    DBSCHEMA_LIVE_VERIFY_DRIVER: input.driver,
    DBSCHEMA_LIVE_VERIFY_CONNECTION_ID: input.connectionId,
    DBSCHEMA_LIVE_VERIFY_CONNECTION_NAME: input.connectionName,
    DBSCHEMA_LIVE_VERIFY_CONNECTION_STRING: input.connectionString,
    DBSCHEMA_LIVE_VERIFY_READONLY:
      input.readonly === undefined ? undefined : input.readonly ? "1" : "0",
    DBSCHEMA_LIVE_VERIFY_DEFAULT_SCHEMA: input.defaultSchema,
  };
}

export function resolveLiveVerificationPrereqTarget(input: {
  driver: "mysql" | "postgres";
  connectionId?: string;
  connectionName?: string;
  connectionString?: string;
  readonly?: boolean;
  defaultSchema?: string;
}): {
  connectionLabel?: string;
  host?: string;
  port?: number;
  database?: string;
  readonly?: boolean;
  checks: LiveVerificationPrereqCheck[];
  notes: string[];
} {
  const checks: LiveVerificationPrereqCheck[] = [];
  const notes: string[] = [];

  if (input.connectionString) {
    checks.push(
      liveVerificationPrereqCheckSchema.parse({
        id: "connection-input",
        status: "passed",
        note: "Bootstrap connection string provided for prereq probing.",
      }),
    );

    const bootstrap = buildReleaseVerificationBootstrapConfig({
      driver: input.driver,
      connectionName: input.connectionName,
      connectionString: input.connectionString,
      readonly: input.readonly,
      defaultSchema: input.defaultSchema,
    });

    if (!bootstrap.config) {
      checks.push(
        liveVerificationPrereqCheckSchema.parse({
          id: "bootstrap-config",
          status: "failed",
          note:
            bootstrap.error ??
            "Live verification bootstrap connection string did not resolve a usable config.",
        }),
      );
      return { checks, notes };
    }

    checks.push(
      liveVerificationPrereqCheckSchema.parse({
        id: "bootstrap-config",
        status: "passed",
        note: `Resolved bootstrap target ${bootstrap.config.host}:${bootstrap.config.port}/${bootstrap.config.database}.`,
      }),
    );

    return {
      connectionLabel: bootstrap.config.name,
      host: bootstrap.config.host,
      port: bootstrap.config.port,
      database: bootstrap.config.database,
      readonly: bootstrap.config.readonly,
      checks,
      notes,
    };
  }

  if (input.connectionId || input.connectionName) {
    const selector = input.connectionId ? `connection-id=${input.connectionId}` : `connection-name=${input.connectionName}`;
    checks.push(
      liveVerificationPrereqCheckSchema.parse({
        id: "connection-input",
        status: "passed",
        note: `Saved connection selector provided (${selector}).`,
      }),
    );
    checks.push(
      liveVerificationPrereqCheckSchema.parse({
        id: "bootstrap-config",
        status: "warning",
        note:
          "Prereq probe cannot inspect saved-connection host or port before app runtime; provide --connection-string for TCP reachability checks, or run the full live verifier.",
      }),
    );
    notes.push(
      "Saved-connection prereq mode is advisory only because the probe cannot read host or port details outside the app runtime.",
    );
    return {
      connectionLabel: input.connectionName ?? input.connectionId,
      readonly: input.readonly,
      checks,
      notes,
    };
  }

  checks.push(
    liveVerificationPrereqCheckSchema.parse({
      id: "connection-input",
      status: "failed",
      note:
        "Live verification prereq probe requires --connection-id, --connection-name, or --connection-string.",
    }),
  );

  return { checks, notes };
}

export async function probeTcpEndpoint(input: {
  host?: string;
  port?: number;
  timeoutMs?: number;
}): Promise<LiveVerificationPrereqCheck> {
  if (!input.host || !input.port) {
    return liveVerificationPrereqCheckSchema.parse({
      id: "tcp-connectivity",
      status: "skipped",
      note:
        "TCP reachability probe was skipped because the target host or port could not be resolved ahead of app runtime.",
    });
  }

  const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : 3000;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (
      status: "passed" | "failed",
      note: string,
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(
        liveVerificationPrereqCheckSchema.parse({
          id: "tcp-connectivity",
          status,
          note,
        }),
      );
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish("passed", `TCP connection succeeded to ${input.host}:${input.port}.`);
    });
    socket.once("timeout", () => {
      finish("failed", `Timed out reaching ${input.host}:${input.port} within ${timeoutMs}ms.`);
    });
    socket.once("error", (error: Error) => {
      finish("failed", `TCP probe failed for ${input.host}:${input.port}: ${error.message}`);
    });
    socket.connect(input.port, input.host);
  });
}

export function parseFlowCheckpoints(
  logPath: string,
  driver: "mysql" | "postgres",
): LiveVerificationFlow[] {
  if (!fs.existsSync(logPath)) {
    return REQUIRED_FLOW_IDS.map((id) =>
      liveVerificationFlowSchema.parse({
        id,
        status: "skipped",
        note: "Verification log was not created.",
      }),
    );
  }

  const explicit = new Map<string, LiveVerificationFlow>();
  const checkpoints = extractDesktopCheckpoints(fs.readFileSync(logPath, "utf8"));

  for (const checkpoint of checkpoints) {
    if (checkpoint.name !== "db_workbench_live_flow") {
      continue;
    }

    const flowDriver = checkpoint.metadata.driver;
    if (flowDriver !== driver) {
      continue;
    }

    const flowId = checkpoint.metadata.flowId;
    const status = checkpoint.metadata.status;
    if (typeof flowId !== "string" || typeof status !== "string") {
      continue;
    }

    explicit.set(
      flowId,
      liveVerificationFlowSchema.parse({
        id: flowId,
        status,
        note: typeof checkpoint.metadata.note === "string" ? checkpoint.metadata.note : undefined,
      }),
    );
  }

  return REQUIRED_FLOW_IDS.map((id) =>
    explicit.get(id) ??
    liveVerificationFlowSchema.parse({
      id,
      status: "skipped",
      note: "No explicit evidence recorded for this flow in the current run.",
    }),
  );
}

export function parseCompletedMetadata(
  logPath: string,
  driver: "mysql" | "postgres",
): {
  connectionLabel?: string;
  database?: string;
  readonly?: boolean;
  completionStatus?: "passed" | "failed" | "warning";
  completionNote?: string;
} {
  if (!fs.existsSync(logPath)) {
    return {};
  }

  const checkpoints = extractDesktopCheckpoints(fs.readFileSync(logPath, "utf8"));
  const completion = checkpoints.find(
    (checkpoint) =>
      checkpoint.name === LIVE_COMPLETED_CHECKPOINT &&
      checkpoint.metadata.driver === driver,
  );
  if (!completion) {
    return {};
  }

  return {
    connectionLabel:
      typeof completion.metadata.connectionName === "string"
        ? completion.metadata.connectionName
        : undefined,
    database:
      typeof completion.metadata.database === "string"
        ? completion.metadata.database
        : undefined,
    readonly:
      typeof completion.metadata.readonly === "boolean"
        ? completion.metadata.readonly
        : undefined,
    completionStatus:
      completion.metadata.status === "passed" ||
      completion.metadata.status === "failed" ||
      completion.metadata.status === "warning"
        ? completion.metadata.status
        : undefined,
    completionNote:
      typeof completion.metadata.note === "string"
        ? completion.metadata.note
        : undefined,
  };
}

export function buildWorkbenchLiveVerificationArtifact(input: {
  runId: string;
  generatedAt: string;
  driver: "mysql" | "postgres";
  connectionLabel?: string;
  database?: string;
  readonly?: boolean;
  flows: LiveVerificationFlow[];
  notes?: string[];
}): WorkbenchLiveVerificationArtifact {
  return workbenchLiveVerificationArtifactSchema.parse({
    artifactVersion: "v1",
    runId: input.runId,
    generatedAt: input.generatedAt,
    driver: input.driver,
    connectionLabel: input.connectionLabel,
    database: input.database,
    readonly: input.readonly,
    flows: input.flows,
    summary: summarizeFlows(input.flows),
    notes: input.notes ?? [],
  });
}

export function buildWorkbenchLiveVerificationPrereqArtifact(input: {
  runId: string;
  generatedAt: string;
  driver: "mysql" | "postgres";
  connectionLabel?: string;
  host?: string;
  port?: number;
  database?: string;
  readonly?: boolean;
  checks: LiveVerificationPrereqCheck[];
  notes?: string[];
}): WorkbenchLiveVerificationPrereqArtifact {
  return workbenchLiveVerificationPrereqArtifactSchema.parse({
    artifactVersion: "v1",
    runId: input.runId,
    generatedAt: input.generatedAt,
    driver: input.driver,
    connectionLabel: input.connectionLabel,
    host: input.host,
    port: input.port,
    database: input.database,
    readonly: input.readonly,
    checks: input.checks,
    summary: summarizeStatuses(input.checks),
    notes: input.notes ?? [],
  });
}

export function renderWorkbenchLiveVerificationMarkdown(
  artifact: WorkbenchLiveVerificationArtifact,
): string {
  const lines = [
    `# DB Workbench Live Verification ${artifact.driver}`,
    "",
    `- Run id: ${artifact.runId}`,
    `- Generated at: ${artifact.generatedAt}`,
    `- Evidence class: live-${artifact.driver}`,
    ...(artifact.connectionLabel ? [`- Connection: ${artifact.connectionLabel}`] : []),
    ...(artifact.database ? [`- Database: ${artifact.database}`] : []),
    ...(artifact.readonly !== undefined ? [`- Readonly: ${artifact.readonly}`] : []),
    `- Overall status: ${artifact.summary.overallStatus}`,
    "",
    "## Flow Results",
    "",
    "| Flow | Status | Note |",
    "|------|--------|------|",
    ...artifact.flows.map((flow) => `| ${flow.id} | ${flow.status} | ${flow.note ?? ""} |`),
  ];

  if (artifact.notes.length > 0) {
    lines.push("", "## Notes", "", ...artifact.notes.map((note) => `- ${note}`));
  }

  return lines.join("\n");
}

export function renderWorkbenchLiveVerificationPrereqMarkdown(
  artifact: WorkbenchLiveVerificationPrereqArtifact,
): string {
  const lines = [
    `# DB Workbench Live Verification Prereq ${artifact.driver}`,
    "",
    `- Run id: ${artifact.runId}`,
    `- Generated at: ${artifact.generatedAt}`,
    ...(artifact.connectionLabel ? [`- Connection: ${artifact.connectionLabel}`] : []),
    ...(artifact.host ? [`- Host: ${artifact.host}`] : []),
    ...(artifact.port ? [`- Port: ${artifact.port}`] : []),
    ...(artifact.database ? [`- Database: ${artifact.database}`] : []),
    ...(artifact.readonly !== undefined ? [`- Readonly: ${artifact.readonly}`] : []),
    `- Overall status: ${artifact.summary.overallStatus}`,
    "",
    "## Check Results",
    "",
    "| Check | Status | Note |",
    "|-------|--------|------|",
    ...artifact.checks.map((check) => `| ${check.id} | ${check.status} | ${check.note ?? ""} |`),
  ];

  if (artifact.notes.length > 0) {
    lines.push("", "## Notes", "", ...artifact.notes.map((note) => `- ${note}`));
  }

  return lines.join("\n");
}

export function shouldFailLiveVerificationPrereq(
  artifact: WorkbenchLiveVerificationPrereqArtifact,
): boolean {
  return artifact.summary.overallStatus === "failed";
}

export async function runWorkbenchLiveVerificationPrereq(cwd = process.cwd()) {
  const driver = parseDriverArg();
  const connectionId = parseArgValue("connection-id");
  const connectionName = parseArgValue("connection-name", ["connection"]);
  const parsedConnectionString = parseArgValue("connection-string", ["connection-url", "url"]);
  const readonly = parseBooleanArg("readonly");
  const parsedDefaultSchema = parseArgValue("default-schema");
  const targetArgs = resolveLiveVerificationTargetArgs({
    driver,
    connectionString: parsedConnectionString,
    defaultSchema: parsedDefaultSchema,
    lab: hasArg("lab"),
  });
  const connectionString = targetArgs.connectionString;
  const defaultSchema = targetArgs.defaultSchema;
  const timeoutMs = parseTimeoutMs();
  const outputDir = path.join(cwd, "artifacts", "release-verification");
  fs.mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const runId = `workbench-live-prereq-${driver}-${now.toISOString().replace(/[:.]/g, "-")}`;
  const resolved = resolveLiveVerificationPrereqTarget({
    driver,
    connectionId,
    connectionName,
    connectionString,
    readonly,
    defaultSchema,
  });
  const tcpCheck = await probeTcpEndpoint({
    host: resolved.host,
    port: resolved.port,
    timeoutMs,
  });

  const artifact = buildWorkbenchLiveVerificationPrereqArtifact({
    runId,
    generatedAt: now.toISOString(),
    driver,
    connectionLabel: resolved.connectionLabel ?? connectionName,
    host: resolved.host,
    port: resolved.port,
    database: resolved.database,
    readonly: resolved.readonly,
    checks: [...resolved.checks, tcpCheck],
    notes: resolved.notes,
  });

  const jsonPath = path.join(outputDir, `${runId}.json`);
  const markdownPath = path.join(outputDir, `${runId}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(markdownPath, renderWorkbenchLiveVerificationPrereqMarkdown(artifact), "utf8");

  return {
    artifact,
    artifactJsonPath: jsonPath,
    artifactMarkdownPath: markdownPath,
  };
}

export async function runWorkbenchLiveVerification(cwd = process.cwd()) {
  const driver = parseDriverArg();
  const connectionId = parseArgValue("connection-id");
  const connectionName = parseArgValue("connection-name", ["connection"]);
  const parsedConnectionString = parseArgValue("connection-string", ["connection-url", "url"]);
  const readonly = parseBooleanArg("readonly");
  const parsedDefaultSchema = parseArgValue("default-schema");
  const targetArgs = resolveLiveVerificationTargetArgs({
    driver,
    connectionString: parsedConnectionString,
    defaultSchema: parsedDefaultSchema,
    lab: hasArg("lab"),
  });
  const connectionString = targetArgs.connectionString;
  const defaultSchema = targetArgs.defaultSchema;
  const timeoutMs = parseTimeoutMs();
  const outputDir = path.join(cwd, "artifacts", "release-verification");
  fs.mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const runId = `workbench-live-${driver}-${now.toISOString().replace(/[:.]/g, "-")}`;
  const logPath = path.join(outputDir, `${runId}.log`);
  const processLogPath = path.join(outputDir, `${runId}.process.log`);

  const runtime = await runTauriDevVerification({
    cwd,
    logPath,
    processLogPath,
    requiredCheckpoints: [...DEV_TAURI_READY_CHECKPOINTS, LIVE_COMPLETED_CHECKPOINT],
    timeoutMs,
    extraEnv: buildLiveVerificationEnvOverrides({
      driver,
      connectionId,
      connectionName,
      connectionString,
      readonly,
      defaultSchema,
    }),
  });

  const flows = parseFlowCheckpoints(logPath, driver);
  const completion = parseCompletedMetadata(logPath, driver);
  const notes: string[] = [];
  if (!runtime.ready) {
    notes.push(
      runtime.exitedEarly
        ? `tauri dev exited before live verification completed. Missing checkpoints: ${runtime.missingCheckpoints.join(", ")}`
        : `Timed out waiting for live verification checkpoints: ${runtime.missingCheckpoints.join(", ")}`,
    );
  }
  if (completion.completionNote) {
    notes.push(completion.completionNote);
  }

  const artifact = buildWorkbenchLiveVerificationArtifact({
    runId,
    generatedAt: now.toISOString(),
    driver,
    connectionLabel: completion.connectionLabel ?? connectionName,
    database: completion.database,
    readonly: completion.readonly,
    flows,
    notes,
  });

  const jsonPath = path.join(outputDir, `${runId}.json`);
  const markdownPath = path.join(outputDir, `${runId}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(markdownPath, renderWorkbenchLiveVerificationMarkdown(artifact), "utf8");

  return {
    artifact,
    artifactJsonPath: jsonPath,
    artifactMarkdownPath: markdownPath,
    processLogPath,
  };
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  if (hasArg("prereq-only")) {
    runWorkbenchLiveVerificationPrereq(process.cwd())
      .then(({ artifact, artifactJsonPath, artifactMarkdownPath }) => {
        console.log(
          `live verification prereq artifact written:\n- ${artifactJsonPath}\n- ${artifactMarkdownPath}`,
        );
        if (shouldFailLiveVerificationPrereq(artifact)) {
          process.exitCode = 1;
        }
      })
      .catch((error) => {
        console.error(String(error));
        process.exit(1);
      });
  } else {
  runWorkbenchLiveVerification(process.cwd())
    .then(({ artifactJsonPath, artifactMarkdownPath, processLogPath }) => {
      console.log(
        `live verification artifact written:\n- ${artifactJsonPath}\n- ${artifactMarkdownPath}\n- ${processLogPath}`,
      );
    })
    .catch((error) => {
      console.error(String(error));
      process.exit(1);
    });
  }
}
