import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  desktopDiagnosticEntrySchema,
  desktopSmokeArtifactSchema,
  desktopSmokeBlockerFindingSchema,
  desktopSmokeLogExcerptSchema,
  desktopSmokeStepSchema,
  smokeCheckpointSchema,
  type DesktopDiagnosticEntry,
  type DesktopSmokeArtifact,
  type DesktopSmokeBlockerFinding,
  type DesktopSmokeLogExcerpt,
  type DesktopSmokeRunMode,
  type DesktopSmokeStep,
  type SmokeCheckpoint,
  type SmokeRecoveryClassification,
} from "../shared/release-verification";
import { extractDesktopCheckpoints } from "../shared/desktop-runtime";

export const DESKTOP_SMOKE_STEP_IDS = {
  startup: "startup",
  dashboardReady: "dashboard-ready",
  dbWorkbenchEntry: "db-workbench-entry",
  recoveryClassification: "recovery-classification",
} as const;

export function createDesktopSmokeChecklist(): DesktopSmokeStep[] {
  return [
    {
      id: DESKTOP_SMOKE_STEP_IDS.startup,
      title: "Tauri startup",
      status: "skipped",
      detail: "Confirm the packaged or dev Tauri runtime reaches the first browser window.",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.dashboardReady,
      title: "Dashboard ready",
      status: "skipped",
      detail: "Confirm the main dashboard surface rendered inside the Tauri window.",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.dbWorkbenchEntry,
      title: "DB workbench surface",
      status: "skipped",
      detail: "Confirm the real DB workbench surface mounted inside the current Tauri app.",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.recoveryClassification,
      title: "Connection recovery classification",
      status: "skipped",
      detail: "Capture whether remembered connection recovery restored, fell back, or was absent.",
      diagnosticIds: [],
    },
  ].map((step) => desktopSmokeStepSchema.parse(step));
}

export function summarizeDesktopSmokeSteps(steps: DesktopSmokeStep[]) {
  const passedCount = steps.filter((step) => step.status === "passed").length;
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const warningCount = steps.filter((step) => step.status === "warning").length;
  const skippedCount = steps.filter((step) => step.status === "skipped").length;

  return {
    passedCount,
    failedCount,
    warningCount,
    skippedCount,
    overallStatus:
      failedCount > 0 ? "failed" : warningCount > 0 || skippedCount > 0 ? "warning" : "passed",
  } as const;
}

function parseCheckpointLog(logContents: string): SmokeCheckpoint[] {
  return extractDesktopCheckpoints(logContents).map((checkpoint) =>
    smokeCheckpointSchema.parse({
      name: checkpoint.name,
      metadata: checkpoint.metadata,
    }),
  );
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
  return desktopSmokeLogExcerptSchema.parse({
    path: logPath,
    excerpt: excerptLines.join("\n"),
    startLine: Math.max(1, lines.length - excerptLines.length + 1),
    endLine: lines.length,
  });
}

function setStep(
  steps: DesktopSmokeStep[],
  stepId: string,
  status: DesktopSmokeStep["status"],
  detail: string,
) {
  const step = steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    return;
  }
  step.status = status;
  step.detail = detail;
}

function classifyRecovery(
  checkpoints: SmokeCheckpoint[],
): SmokeRecoveryClassification | undefined {
  const recoveryCheckpoint = checkpoints.find(
    (checkpoint) => checkpoint.name === "db_workbench_recovery_classified",
  );
  const classification = recoveryCheckpoint?.metadata.classification;
  if (
    classification === "restored" ||
    classification === "missing-fallback" ||
    classification === "none"
  ) {
    return classification;
  }
  return undefined;
}

export function classifyDesktopSmokeFromCheckpoints(input: {
  steps?: DesktopSmokeStep[];
  checkpoints: SmokeCheckpoint[];
}): {
  steps: DesktopSmokeStep[];
  blockerFindings: DesktopSmokeBlockerFinding[];
  recoveryClassification?: SmokeRecoveryClassification;
} {
  const steps = (input.steps ?? createDesktopSmokeChecklist()).map((step) =>
    desktopSmokeStepSchema.parse(step),
  );
  const blockerFindings: DesktopSmokeBlockerFinding[] = [];
  const checkpointNames = new Set(input.checkpoints.map((checkpoint) => checkpoint.name));
  const recoveryClassification = classifyRecovery(input.checkpoints);

  if (
    checkpointNames.has("tauri_setup_ready") &&
    checkpointNames.has("browser_window_loaded")
  ) {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.startup,
      "passed",
      "Observed Tauri setup and browser window readiness checkpoints.",
    );
  } else {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.startup,
      "failed",
      "Missing Tauri setup or browser window readiness checkpoint.",
    );
    blockerFindings.push(
      desktopSmokeBlockerFindingSchema.parse({
        code: "TAURI_STARTUP_CHECKPOINT_MISSING",
        blocker: true,
        severity: "critical",
        message: "Release verification did not observe both tauri_setup_ready and browser_window_loaded.",
      }),
    );
  }

  if (checkpointNames.has("dashboard_ready")) {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.dashboardReady,
      "passed",
      "Observed dashboard_ready from the live Tauri shell.",
    );
  } else {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.dashboardReady,
      "failed",
      "Missing dashboard_ready checkpoint from the live Tauri shell.",
    );
    blockerFindings.push(
      desktopSmokeBlockerFindingSchema.parse({
        code: "DASHBOARD_READY_CHECKPOINT_MISSING",
        blocker: true,
        severity: "critical",
        message: "The release-verification run never reached dashboard_ready.",
      }),
    );
  }

  if (checkpointNames.has("db_workbench_surface_ready")) {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.dbWorkbenchEntry,
      "passed",
      "Observed db_workbench_surface_ready from the real DB workbench surface.",
    );
  } else {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.dbWorkbenchEntry,
      "failed",
      "Missing db_workbench_surface_ready from the real DB workbench surface.",
    );
    blockerFindings.push(
      desktopSmokeBlockerFindingSchema.parse({
        code: "DB_WORKBENCH_ENTRY_CHECKPOINT_MISSING",
        blocker: true,
        severity: "critical",
        message: "The release-verification run never reached the DB workbench surface.",
      }),
    );
  }

  if (recoveryClassification) {
    const detail =
      recoveryClassification === "restored"
        ? "Recovered the remembered connection and kept the operator in the workbench."
        : recoveryClassification === "missing-fallback"
          ? "Remembered connection was missing and the app fell back to the connection center."
          : "No remembered connection was available for recovery in this run.";
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.recoveryClassification,
      recoveryClassification === "missing-fallback" ? "warning" : "passed",
      detail,
    );
  } else {
    setStep(
      steps,
      DESKTOP_SMOKE_STEP_IDS.recoveryClassification,
      "failed",
      "Missing db_workbench_recovery_classified checkpoint.",
    );
    blockerFindings.push(
      desktopSmokeBlockerFindingSchema.parse({
        code: "DB_WORKBENCH_RECOVERY_CHECKPOINT_MISSING",
        blocker: true,
        severity: "critical",
        message: "The release-verification run never classified connection recovery.",
      }),
    );
  }

  return {
    steps,
    blockerFindings,
    recoveryClassification,
  };
}

export function buildDesktopSmokeArtifact(input: {
  runId: string;
  generatedAt: string;
  appVersion: string;
  environment: DesktopSmokeRunMode;
  runMode?: DesktopSmokeRunMode;
  logPath: string;
  executablePath?: string;
  screenshotPaths?: string[];
  logExcerpt?: DesktopSmokeLogExcerpt;
  blockerFindings?: DesktopSmokeBlockerFinding[];
  diagnostics?: DesktopDiagnosticEntry[];
  observedCheckpoints?: SmokeCheckpoint[];
  recoveryClassification?: SmokeRecoveryClassification;
  steps: DesktopSmokeStep[];
}): DesktopSmokeArtifact {
  const diagnostics = (input.diagnostics ?? []).map((entry) =>
    desktopDiagnosticEntrySchema.parse(entry),
  );
  const steps = input.steps.map((step) => desktopSmokeStepSchema.parse(step));
  const observedCheckpoints = (input.observedCheckpoints ?? []).map((checkpoint) =>
    smokeCheckpointSchema.parse(checkpoint),
  );
  const blockerFindings = (input.blockerFindings ?? []).map((finding) =>
    desktopSmokeBlockerFindingSchema.parse(finding),
  );

  return desktopSmokeArtifactSchema.parse({
    artifactVersion: "v2",
    runId: input.runId,
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    environment: input.environment,
    runMode: input.runMode ?? input.environment,
    logPath: input.logPath,
    executablePath: input.executablePath,
    screenshotPaths: input.screenshotPaths ?? [],
    observedCheckpoints,
    recoveryClassification: input.recoveryClassification,
    logExcerpt: input.logExcerpt,
    blockerFindings,
    diagnostics,
    steps,
    summary: summarizeDesktopSmokeSteps(steps),
  });
}

export function renderDesktopSmokeMarkdown(artifact: DesktopSmokeArtifact): string {
  const lines = [
    `# Tauri Desktop Smoke ${artifact.runId}`,
    "",
    `- Generated at: ${artifact.generatedAt}`,
    `- App version: ${artifact.appVersion}`,
    `- Environment: ${artifact.environment}`,
    `- Log path: ${artifact.logPath}`,
    ...(artifact.executablePath ? [`- Executable path: ${artifact.executablePath}`] : []),
    ...(artifact.recoveryClassification
      ? [`- Recovery classification: ${artifact.recoveryClassification}`]
      : []),
    `- Overall status: ${artifact.summary.overallStatus}`,
    "",
    "## Steps",
    "",
    "| Step | Status | Detail |",
    "|------|--------|--------|",
    ...artifact.steps.map((step) => `| ${step.title} | ${step.status} | ${step.detail ?? ""} |`),
  ];

  if (artifact.observedCheckpoints.length > 0) {
    lines.push("", "## Observed Checkpoints", "");
    for (const checkpoint of artifact.observedCheckpoints) {
      lines.push(`- ${checkpoint.name}`);
    }
  }

  if (artifact.blockerFindings.length > 0) {
    lines.push("", "## Blockers", "", "| Code | Blocker | Severity | Message |", "|------|---------|----------|---------|");
    for (const finding of artifact.blockerFindings) {
      lines.push(`| ${finding.code} | ${finding.blocker ? "yes" : "no"} | ${finding.severity} | ${finding.message} |`);
    }
  }

  if (artifact.logExcerpt) {
    lines.push("", "## Log Excerpt", "", `- Source: ${artifact.logExcerpt.path}`, "", "```text", artifact.logExcerpt.excerpt, "```");
  }

  return lines.join("\n");
}

function writeSmokeArtifacts(cwd: string) {
  const modeArgIndex = process.argv.indexOf("--mode");
  const logArgIndex = process.argv.indexOf("--log");
  const appVersionArgIndex = process.argv.indexOf("--app-version");
  const executableArgIndex = process.argv.indexOf("--executable");
  const environment =
    (modeArgIndex >= 0 ? process.argv[modeArgIndex + 1] : "dev-tauri") as DesktopSmokeRunMode;
  const logPath =
    (logArgIndex >= 0 ? process.argv[logArgIndex + 1] : undefined) ??
    path.join(cwd, "artifacts", "release-verification", "manual-smoke.log");
  const appVersion = appVersionArgIndex >= 0 ? process.argv[appVersionArgIndex + 1] : "manual";
  const executablePath =
    executableArgIndex >= 0 ? process.argv[executableArgIndex + 1] : undefined;
  const now = new Date();
  const runId = `tauri-smoke-${environment}-${now.toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = path.join(cwd, "artifacts", "release-verification");
  fs.mkdirSync(outputDir, { recursive: true });

  const checkpoints = fs.existsSync(logPath)
    ? parseCheckpointLog(fs.readFileSync(logPath, "utf8"))
    : [];
  const classified = classifyDesktopSmokeFromCheckpoints({ checkpoints });
  const artifact = buildDesktopSmokeArtifact({
    runId,
    generatedAt: now.toISOString(),
    appVersion,
    environment,
    logPath,
    executablePath,
    observedCheckpoints: checkpoints,
    recoveryClassification: classified.recoveryClassification,
    blockerFindings: classified.blockerFindings,
    logExcerpt: readLogExcerpt(logPath),
    steps: classified.steps,
  });

  const jsonPath = path.join(outputDir, `${runId}.json`);
  const markdownPath = path.join(outputDir, `${runId}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(markdownPath, renderDesktopSmokeMarkdown(artifact), "utf8");

  console.log(`desktop smoke artifact written:\n- ${jsonPath}\n- ${markdownPath}`);
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  writeSmokeArtifacts(process.cwd());
}
