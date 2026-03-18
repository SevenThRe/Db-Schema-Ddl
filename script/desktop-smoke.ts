import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  desktopSmokeBlockerFindingSchema,
  desktopDiagnosticEntrySchema,
  desktopSmokeArtifactSchema,
  desktopSmokeLogExcerptSchema,
  desktopSmokeStepSchema,
  type DesktopSmokeBlockerFinding,
  type DesktopDiagnosticEntry,
  type DesktopSmokeArtifact,
  type DesktopSmokeLogExcerpt,
  type DesktopSmokeRunMode,
  type DesktopSmokeStep,
} from "../shared/schema";

export const DESKTOP_SMOKE_STEP_IDS = {
  startup: "startup",
  sqliteInit: "sqlite-init",
  extensionEntry: "extension-entry",
  dbManagementMysqlRead: "db-management-mysql-read",
  shutdown: "shutdown",
} as const;

export function createDesktopSmokeChecklist(): DesktopSmokeStep[] {
  return [
    {
      id: DESKTOP_SMOKE_STEP_IDS.startup,
      title: "应用启动",
      status: "skipped",
      detail: "确认 Electron 可以打开主窗口且没有原始启动错误框。",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.sqliteInit,
      title: "SQLite 初始化与迁移",
      status: "skipped",
      detail: "确认本地数据库初始化成功，兼容列和迁移能正常执行。",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.extensionEntry,
      title: "扩展入口检查",
      status: "skipped",
      detail: "确认 DB 管理入口、catalog 检查和未发布提示表现正常。",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.dbManagementMysqlRead,
      title: "MySQL 读取链路",
      status: "skipped",
      detail: "确认至少一条真实 MySQL 连接、database 选择和 schema 读取链路可用。",
      diagnosticIds: [],
    },
    {
      id: DESKTOP_SMOKE_STEP_IDS.shutdown,
      title: "应用关闭",
      status: "skipped",
      detail: "确认退出时不会弹出多重原始 JS 错误框，且日志有完整关闭记录。",
      diagnosticIds: [],
    },
  ].map((step) => desktopSmokeStepSchema.parse(step));
}

export function summarizeDesktopSmokeSteps(steps: DesktopSmokeStep[]) {
  const passedCount = steps.filter((step) => step.status === "passed").length;
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const warningCount = steps.filter((step) => step.status === "warning").length;
  const skippedCount = steps.filter((step) => step.status === "skipped").length;

  const overallStatus =
    failedCount > 0 ? "failed" : warningCount > 0 || skippedCount > 0 ? "warning" : "passed";

  return {
    passedCount,
    failedCount,
    warningCount,
    skippedCount,
    overallStatus,
  } as const;
}

export function buildDesktopSmokeArtifact(input: {
  runId: string;
  generatedAt: string;
  appVersion: string;
  environment?: "dev-electron" | "packaged-electron";
  runMode?: DesktopSmokeRunMode;
  logPath: string;
  executablePath?: string;
  screenshotPaths?: string[];
  logExcerpt?: DesktopSmokeLogExcerpt;
  blockerFindings?: DesktopSmokeBlockerFinding[];
  diagnostics?: DesktopDiagnosticEntry[];
  steps: DesktopSmokeStep[];
}): DesktopSmokeArtifact {
  const diagnostics = (input.diagnostics ?? []).map((entry) => desktopDiagnosticEntrySchema.parse(entry));
  const steps = input.steps.map((step) => desktopSmokeStepSchema.parse(step));
  const runMode = resolveDesktopSmokeRunMode(input.environment, input.runMode);
  const environment = input.environment ?? (runMode === "dev-electron" ? "dev-electron" : "packaged-electron");
  const logExcerpt = input.logExcerpt ? desktopSmokeLogExcerptSchema.parse(input.logExcerpt) : undefined;
  const blockerFindings = (input.blockerFindings ?? []).map((finding) =>
    desktopSmokeBlockerFindingSchema.parse(finding),
  );

  return desktopSmokeArtifactSchema.parse({
    artifactVersion: "v1",
    runId: input.runId,
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    environment,
    runMode,
    logPath: input.logPath,
    executablePath: input.executablePath,
    screenshotPaths: input.screenshotPaths ?? [],
    logExcerpt,
    blockerFindings,
    diagnostics,
    steps,
    summary: summarizeDesktopSmokeSteps(steps),
  });
}

export function renderDesktopSmokeMarkdown(artifact: DesktopSmokeArtifact): string {
  const lines = [
    `# Desktop Smoke Run ${artifact.runId}`,
    "",
    `- Generated at: ${artifact.generatedAt}`,
    `- App version: ${artifact.appVersion}`,
    `- Environment: ${artifact.environment}`,
    `- Run mode: ${artifact.runMode}`,
    `- Log path: ${artifact.logPath}`,
    ...(artifact.executablePath ? [`- Executable path: ${artifact.executablePath}`] : []),
    `- Overall status: ${artifact.summary.overallStatus}`,
    "",
    "## Steps",
    "",
    "| Step | Status | Detail |",
    "|------|--------|--------|",
    ...artifact.steps.map((step) => `| ${step.title} | ${step.status} | ${step.detail ?? ""} |`),
  ];

  if (artifact.diagnostics.length > 0) {
    lines.push("", "## Diagnostics", "", "| Code | Category | Severity | Message |", "|------|----------|----------|---------|");
    for (const diagnostic of artifact.diagnostics) {
      lines.push(`| ${diagnostic.code} | ${diagnostic.category} | ${diagnostic.severity} | ${diagnostic.message} |`);
    }
  }

  if (artifact.screenshotPaths.length > 0) {
    lines.push("", "## Screenshots", "", ...artifact.screenshotPaths.map((screenshotPath) => `- ${screenshotPath}`));
  }

  if (artifact.logExcerpt) {
    lines.push("", "## Log Excerpt", "", `- Source: ${artifact.logExcerpt.path}`);
    if (artifact.logExcerpt.startLine || artifact.logExcerpt.endLine) {
      const start = artifact.logExcerpt.startLine ?? "?";
      const end = artifact.logExcerpt.endLine ?? "?";
      lines.push(`- Lines: ${start}-${end}`);
    }
    lines.push("", "```text", artifact.logExcerpt.excerpt, "```");
  }

  if (artifact.blockerFindings.length > 0) {
    lines.push("", "## Blocker Findings", "", "| Code | Blocker | Severity | Message |", "|------|---------|----------|---------|");
    for (const finding of artifact.blockerFindings) {
      lines.push(`| ${finding.code} | ${finding.blocker ? "yes" : "no"} | ${finding.severity} | ${finding.message} |`);
    }
  }

  return lines.join("\n");
}

function resolveDesktopSmokeRunMode(
  environment: "dev-electron" | "packaged-electron" | undefined,
  runMode: DesktopSmokeRunMode | undefined,
): DesktopSmokeRunMode {
  if (runMode) {
    return runMode;
  }

  return environment === "packaged-electron" ? "packaged-win-unpacked" : "dev-electron";
}

function writeSmokeArtifacts(cwd: string) {
  const now = new Date();
  const runId = `desktop-smoke-${now.toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = path.join(cwd, "artifacts", "desktop-smoke");
  fs.mkdirSync(outputDir, { recursive: true });

  const artifact = buildDesktopSmokeArtifact({
    runId,
    generatedAt: now.toISOString(),
    appVersion: "manual",
    environment: "dev-electron",
    logPath: path.join(cwd, "artifacts", "desktop-smoke", "attach-log-path-here.log"),
    steps: createDesktopSmokeChecklist(),
  });

  const jsonPath = path.join(outputDir, `${runId}.json`);
  const markdownPath = path.join(outputDir, `${runId}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  fs.writeFileSync(markdownPath, renderDesktopSmokeMarkdown(artifact), "utf8");

  console.log(`desktop smoke template written:\n- ${jsonPath}\n- ${markdownPath}`);
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  writeSmokeArtifacts(process.cwd());
}
