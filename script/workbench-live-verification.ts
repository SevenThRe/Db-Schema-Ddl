import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  liveVerificationFlowIdSchema,
  liveVerificationFlowSchema,
  workbenchLiveVerificationArtifactSchema,
  type LiveVerificationFlow,
  type WorkbenchLiveVerificationArtifact,
} from "../shared/release-verification";
import { extractDesktopCheckpoints } from "../shared/desktop-runtime";
import { DEV_TAURI_READY_CHECKPOINTS } from "./desktop-dev-smoke";
import { runTauriDevVerification } from "./tauri-dev-runtime";

const REQUIRED_FLOW_IDS = liveVerificationFlowIdSchema.options;
const LIVE_COMPLETED_CHECKPOINT = "db_workbench_live_completed";

function summarizeFlows(flows: LiveVerificationFlow[]) {
  const passedCount = flows.filter((flow) => flow.status === "passed").length;
  const failedCount = flows.filter((flow) => flow.status === "failed").length;
  const warningCount = flows.filter((flow) => flow.status === "warning").length;
  const skippedCount = flows.filter((flow) => flow.status === "skipped").length;

  return {
    passedCount,
    failedCount,
    warningCount,
    skippedCount,
    overallStatus:
      failedCount > 0 ? "failed" : warningCount > 0 || skippedCount > 0 ? "warning" : "passed",
  } as const;
}

function parseArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  return direct ? direct.slice(prefix.length) : undefined;
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

export function renderWorkbenchLiveVerificationMarkdown(
  artifact: WorkbenchLiveVerificationArtifact,
): string {
  const lines = [
    `# DB Workbench Live Verification ${artifact.driver}`,
    "",
    `- Run id: ${artifact.runId}`,
    `- Generated at: ${artifact.generatedAt}`,
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

export async function runWorkbenchLiveVerification(cwd = process.cwd()) {
  const driver = parseDriverArg();
  const connectionId = parseArgValue("connection-id");
  const connectionName = parseArgValue("connection-name");
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
    extraEnv: {
      DBSCHEMA_LIVE_VERIFY_ENABLED: "1",
      DBSCHEMA_LIVE_VERIFY_DRIVER: driver,
      DBSCHEMA_LIVE_VERIFY_CONNECTION_ID: connectionId,
      DBSCHEMA_LIVE_VERIFY_CONNECTION_NAME: connectionName,
    },
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
