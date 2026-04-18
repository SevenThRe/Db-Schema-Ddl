import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  desktopSmokeArtifactSchema,
  lateHardeningVerificationArtifactSchema,
  releaseExitChecklistArtifactSchema,
  releaseExitEvidenceItemSchema,
  releaseShipGateArtifactSchema,
  type DesktopSmokeArtifact,
  type LateHardeningVerificationArtifact,
  type ReleaseExitChecklistArtifact,
  type ReleaseExitEvidenceItem,
  type ReleaseShipGateArtifact,
  type ReleaseShipGateFinding,
  type WorkbenchLiveVerificationArtifact,
  workbenchLiveVerificationArtifactSchema,
} from "../shared/release-verification";

const LATE_HARDENING_VERIFICATION_PATH = path.join(
  ".planning",
  "phases",
  "31-db-workbench-runtime-and-sync-hardening",
  "31-VERIFICATION.md",
);

const POST_RELEASE_BACKLOG = [
  "Data Sync / Job Center still need dedicated runtime proof before promotion beyond Preview.",
] as const;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function listJsonArtifacts(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(directory, entry))
    .sort((left, right) => right.localeCompare(left));
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timestampOrMin(value: string | undefined): number {
  return parseIsoDate(value)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function rememberUnique<T>(values: T[], value: T) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function createFinding(
  code: string,
  message: string,
  artifactPath?: string,
  severity: "warning" | "blocking" = "blocking",
): ReleaseShipGateFinding {
  return {
    code,
    severity,
    message,
    artifactPath,
  };
}

function buildEvidenceItem(input: {
  key: ReleaseExitEvidenceItem["key"];
  label: string;
  status: ReleaseExitEvidenceItem["status"];
  artifactPath?: string;
  generatedAt?: string;
  blockerCodes?: string[];
  notes?: string[];
}): ReleaseExitEvidenceItem {
  return releaseExitEvidenceItemSchema.parse({
    key: input.key,
    label: input.label,
    required: true,
    status: input.status,
    artifactPath: input.artifactPath,
    generatedAt: input.generatedAt,
    blockerCodes: input.blockerCodes ?? [],
    notes: input.notes ?? [],
  });
}

function tryParsePackagedSmoke(filePath: string): DesktopSmokeArtifact | null {
  try {
    const parsed = desktopSmokeArtifactSchema.parse(readJson(filePath));
    return parsed.environment === "packaged-tauri" ? parsed : null;
  } catch {
    return null;
  }
}

function tryParseLiveArtifact(filePath: string): WorkbenchLiveVerificationArtifact | null {
  try {
    return workbenchLiveVerificationArtifactSchema.parse(readJson(filePath));
  } catch {
    return null;
  }
}

function pickLatestByGeneratedAt<T extends { artifact: { generatedAt: string } }>(
  values: T[],
): T | null {
  if (values.length === 0) {
    return null;
  }

  return [...values].sort(
    (left, right) =>
      timestampOrMin(right.artifact.generatedAt) - timestampOrMin(left.artifact.generatedAt),
  )[0]!;
}

function readLateHardeningVerification(cwd = process.cwd()): LateHardeningVerificationArtifact | null {
  const filePath = path.join(cwd, LATE_HARDENING_VERIFICATION_PATH);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const status = source.match(/^status:\s*(.+)$/m)?.[1]?.trim();
  const phase = source.match(/^phase:\s*(.+)$/m)?.[1]?.trim();
  const verifiedAt = source.match(/^verified_at:\s*(.+)$/m)?.[1]?.trim();

  if (!status || !phase || !verifiedAt) {
    return null;
  }

  return lateHardeningVerificationArtifactSchema.parse({
    phase,
    status,
    verifiedAt,
    verificationPath: filePath,
  });
}

function renderReleaseExitChecklistMarkdown(
  checklist: ReleaseExitChecklistArtifact,
): string {
  const lines = [
    "# Release Exit Checklist",
    "",
    `- Run id: ${checklist.runId}`,
    `- Generated at: ${checklist.generatedAt}`,
    ...(checklist.installerPath ? [`- Installer path: ${checklist.installerPath}`] : []),
    ...(checklist.installerMtime ? [`- Installer mtime: ${checklist.installerMtime}`] : []),
    `- Decision: ${checklist.decision}`,
    `- Blocked: ${checklist.blocked}`,
    "",
    "## Required evidence",
    "",
    "| Evidence | Status | Generated at | Artifact | Notes |",
    "|----------|--------|--------------|----------|-------|",
    ...Object.values(checklist.evidence).map((entry) =>
      `| ${entry.label} | ${entry.status} | ${entry.generatedAt ?? ""} | ${entry.artifactPath ?? ""} | ${(entry.notes ?? []).join(" / ")} |`,
    ),
    "",
    "## Ship blockers",
    "",
  ];

  if (checklist.shipBlockers.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...checklist.shipBlockers.map((blocker) => `- ${blocker.code}: ${blocker.message}`));
  }

  lines.push("", "## Post-release backlog", "");

  if (checklist.postReleaseBacklog.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...checklist.postReleaseBacklog.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

export function evaluateReleaseShipGate(input: {
  packagedSmoke?: { path: string; artifact: DesktopSmokeArtifact } | null;
  liveArtifacts: { path: string; artifact: WorkbenchLiveVerificationArtifact }[];
  lateHardening?: LateHardeningVerificationArtifact | null;
  now?: Date;
}): ReleaseShipGateArtifact {
  const now = input.now ?? new Date();
  const blockers: ReleaseShipGateFinding[] = [];
  const warnings: ReleaseShipGateFinding[] = [];
  const missingEvidence: ReleaseExitChecklistArtifact["missingEvidence"] = [];
  const staleEvidence: ReleaseExitChecklistArtifact["staleEvidence"] = [];
  const mysqlLive = pickLatestByGeneratedAt(
    input.liveArtifacts.filter((entry) => entry.artifact.driver === "mysql"),
  );
  const postgresLive = pickLatestByGeneratedAt(
    input.liveArtifacts.filter((entry) => entry.artifact.driver === "postgres"),
  );

  let installerPath: string | undefined;
  let installerMtime: string | undefined;

  const packagedGeneratedAt = input.packagedSmoke?.artifact.generatedAt;
  const packagedGeneratedAtDate = parseIsoDate(packagedGeneratedAt);

  const packagedSmokeEvidence = (() => {
    if (!input.packagedSmoke) {
      const code = "PACKAGED_SMOKE_MISSING";
      blockers.push(
        createFinding(code, "Missing packaged Tauri smoke artifact."),
      );
      rememberUnique(missingEvidence, "packaged-smoke");
      return buildEvidenceItem({
        key: "packaged-smoke",
        label: "Packaged smoke",
        status: "missing",
        blockerCodes: [code],
        notes: ["Run `npm run verify:desktop:smoke:packaged` for the current installer candidate."],
      });
    }

    const { artifact, path: artifactPath } = input.packagedSmoke;
    installerPath = artifact.executablePath;
    const blockerCodes: string[] = [];
    const notes: string[] = [];
    let status: ReleaseExitEvidenceItem["status"] = "current";

    if (
      artifact.summary.overallStatus === "failed" ||
      artifact.blockerFindings.some((finding) => finding.blocker)
    ) {
      const code = "PACKAGED_SMOKE_FAILED";
      blockers.push(
        createFinding(
          code,
          "Packaged Tauri smoke artifact contains blockers or failed steps.",
          artifactPath,
        ),
      );
      blockerCodes.push(code);
      status = "failed";
    } else if (artifact.summary.overallStatus === "warning") {
      warnings.push(
        createFinding(
          "PACKAGED_SMOKE_WARNING",
          "Packaged Tauri smoke artifact contains warnings.",
          artifactPath,
          "warning",
        ),
      );
      status = "warning";
      notes.push("Packaged smoke reported warnings; review before publish.");
    }

    if (artifact.executablePath && fs.existsSync(artifact.executablePath)) {
      const executableMtime = fs.statSync(artifact.executablePath).mtime;
      installerMtime = executableMtime.toISOString();
      if (
        status !== "failed" &&
        packagedGeneratedAtDate &&
        packagedGeneratedAtDate.getTime() < executableMtime.getTime()
      ) {
        const code = "PACKAGED_SMOKE_STALE";
        blockers.push(
          createFinding(
            code,
            "Packaged smoke predates the current packaged executable on disk.",
            artifactPath,
          ),
        );
        rememberUnique(staleEvidence, "packaged-smoke");
        blockerCodes.push(code);
        status = "stale";
      }
    }

    return buildEvidenceItem({
      key: "packaged-smoke",
      label: "Packaged smoke",
      status,
      artifactPath,
      generatedAt: artifact.generatedAt,
      blockerCodes,
      notes,
    });
  })();

  const buildLiveEvidence = (
    driver: "mysql" | "postgres",
    artifactEntry: { path: string; artifact: WorkbenchLiveVerificationArtifact } | null,
  ) => {
    const key = driver === "mysql" ? "mysql-live" : "postgres-live";
    const label = driver === "mysql" ? "MySQL live verification" : "PostgreSQL live verification";
    const driverPrefix = driver === "mysql" ? "MYSQL" : "POSTGRES";

    if (!artifactEntry) {
      const code = `${driverPrefix}_LIVE_VERIFICATION_MISSING`;
      blockers.push(
        createFinding(code, `Missing ${label} artifact.`),
      );
      rememberUnique(missingEvidence, key);
      return buildEvidenceItem({
        key,
        label,
        status: "missing",
        blockerCodes: [code],
        notes: [`Run \`npm run verify:desktop:live -- --driver=${driver}\` for the current installer candidate.`],
      });
    }

    const blockerCodes: string[] = [];
    const notes = [...artifactEntry.artifact.notes];
    let status: ReleaseExitEvidenceItem["status"] = "current";

    if (artifactEntry.artifact.summary.overallStatus !== "passed") {
      const code =
        artifactEntry.artifact.summary.overallStatus === "failed"
          ? `${driverPrefix}_LIVE_VERIFICATION_FAILED`
          : `${driverPrefix}_LIVE_VERIFICATION_INCOMPLETE`;
      blockers.push(
        createFinding(
          code,
          artifactEntry.artifact.summary.overallStatus === "failed"
            ? `${label} contains failed flows.`
            : `${label} is incomplete and cannot satisfy the ship gate.`,
          artifactEntry.path,
        ),
      );
      blockerCodes.push(code);
      status = "failed";
    } else if (
      packagedGeneratedAtDate &&
      parseIsoDate(artifactEntry.artifact.generatedAt) &&
      parseIsoDate(artifactEntry.artifact.generatedAt)!.getTime() <
        packagedGeneratedAtDate.getTime()
    ) {
      const code = `${driverPrefix}_LIVE_VERIFICATION_STALE`;
      blockers.push(
        createFinding(
          code,
          `${label} predates the current packaged smoke artifact and is stale for release exit.`,
          artifactEntry.path,
        ),
      );
      rememberUnique(staleEvidence, key);
      blockerCodes.push(code);
      status = "stale";
    }

    return buildEvidenceItem({
      key,
      label,
      status,
      artifactPath: artifactEntry.path,
      generatedAt: artifactEntry.artifact.generatedAt,
      blockerCodes,
      notes,
    });
  };

  const mysqlLiveEvidence = buildLiveEvidence("mysql", mysqlLive);
  const postgresLiveEvidence = buildLiveEvidence("postgres", postgresLive);

  const lateHardeningEvidence = (() => {
    if (!input.lateHardening) {
      const code = "LATE_HARDENING_PROOF_MISSING";
      blockers.push(
        createFinding(code, "Missing late-hardening verification proof."),
      );
      rememberUnique(missingEvidence, "late-hardening");
      return buildEvidenceItem({
        key: "late-hardening",
        label: "Late hardening proof",
        status: "missing",
        blockerCodes: [code],
        notes: ["Phase 31 verification evidence is required for release exit."],
      });
    }

    const blockerCodes: string[] = [];
    const notes = [`${input.lateHardening.phase} status: ${input.lateHardening.status}`];
    let status: ReleaseExitEvidenceItem["status"] = "current";

    if (input.lateHardening.status !== "passed") {
      const code = "LATE_HARDENING_PROOF_NOT_PASSED";
      blockers.push(
        createFinding(
          code,
          `Late hardening verification is not passed (${input.lateHardening.status}).`,
          input.lateHardening.verificationPath,
        ),
      );
      blockerCodes.push(code);
      status = "failed";
    } else if (
      packagedGeneratedAtDate &&
      parseIsoDate(input.lateHardening.verifiedAt) &&
      parseIsoDate(input.lateHardening.verifiedAt)!.getTime() <
        packagedGeneratedAtDate.getTime()
    ) {
      const code = "LATE_HARDENING_PROOF_STALE";
      blockers.push(
        createFinding(
          code,
          "Late hardening verification predates the current packaged smoke artifact.",
          input.lateHardening.verificationPath,
        ),
      );
      rememberUnique(staleEvidence, "late-hardening");
      blockerCodes.push(code);
      status = "stale";
    }

    return buildEvidenceItem({
      key: "late-hardening",
      label: "Late hardening proof",
      status,
      artifactPath: input.lateHardening.verificationPath,
      generatedAt: input.lateHardening.verifiedAt,
      blockerCodes,
      notes,
    });
  })();

  const releaseExitChecklist = releaseExitChecklistArtifactSchema.parse({
    artifactVersion: "v1",
    runId: `release-exit-checklist-${now.toISOString().replace(/[:.]/g, "-")}`,
    generatedAt: now.toISOString(),
    installerPath,
    installerMtime,
    decision: blockers.length > 0 ? "blocked" : "ready",
    blocked: blockers.length > 0,
    evidence: {
      packagedSmoke: packagedSmokeEvidence,
      mysqlLive: mysqlLiveEvidence,
      postgresLive: postgresLiveEvidence,
      lateHardening: lateHardeningEvidence,
    },
    missingEvidence,
    staleEvidence,
    shipBlockers: blockers,
    postReleaseBacklog: [...POST_RELEASE_BACKLOG],
  });

  return releaseShipGateArtifactSchema.parse({
    artifactVersion: "v2",
    runId: `ship-gate-${now.toISOString().replace(/[:.]/g, "-")}`,
    generatedAt: now.toISOString(),
    decision: releaseExitChecklist.decision,
    blocked: releaseExitChecklist.blocked,
    blockers,
    warnings,
    packagedSmokeArtifactPath: input.packagedSmoke?.path,
    liveArtifactPaths: input.liveArtifacts.map((entry) => entry.path),
    lateHardeningArtifactPath: input.lateHardening?.verificationPath,
    requiredEvidence: {
      packagedSmokePresent: packagedSmokeEvidence.status !== "missing",
      mysqlLivePresent: mysqlLiveEvidence.status !== "missing",
      postgresLivePresent: postgresLiveEvidence.status !== "missing",
      lateHardeningPresent: lateHardeningEvidence.status !== "missing",
    },
    missingEvidence: releaseExitChecklist.missingEvidence,
    staleEvidence: releaseExitChecklist.staleEvidence,
    shipBlockers: releaseExitChecklist.shipBlockers,
    releaseExitChecklist,
  });
}

function writeShipGate(cwd = process.cwd()) {
  const artifactDir = path.join(cwd, "artifacts", "release-verification");
  const packagedCandidates = listJsonArtifacts(artifactDir)
    .map((filePath) => ({
      path: filePath,
      artifact: tryParsePackagedSmoke(filePath),
    }))
    .filter((entry): entry is { path: string; artifact: DesktopSmokeArtifact } => entry.artifact !== null);
  const liveArtifacts = listJsonArtifacts(artifactDir)
    .map((filePath) => ({
      path: filePath,
      artifact: tryParseLiveArtifact(filePath),
    }))
    .filter(
      (
        entry,
      ): entry is { path: string; artifact: WorkbenchLiveVerificationArtifact } =>
        entry.artifact !== null,
    );

  const shipGate = evaluateReleaseShipGate({
    packagedSmoke: pickLatestByGeneratedAt(packagedCandidates),
    liveArtifacts,
    lateHardening: readLateHardeningVerification(cwd),
  });

  const checklist = shipGate.releaseExitChecklist!;
  const checklistJsonPath = path.join(artifactDir, `${checklist.runId}.json`);
  const checklistMarkdownPath = path.join(artifactDir, `${checklist.runId}.md`);
  const shipGateJsonPath = path.join(artifactDir, `${shipGate.runId}.json`);

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(checklistJsonPath, JSON.stringify(checklist, null, 2), "utf8");
  fs.writeFileSync(checklistMarkdownPath, renderReleaseExitChecklistMarkdown(checklist), "utf8");
  fs.writeFileSync(
    shipGateJsonPath,
    JSON.stringify(
      releaseShipGateArtifactSchema.parse({
        ...shipGate,
        releaseExitChecklistPath: checklistJsonPath,
      }),
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `release-exit artifacts written:\n- ${checklistJsonPath}\n- ${checklistMarkdownPath}\n- ${shipGateJsonPath}`,
  );
  if (shipGate.blocked) {
    process.exitCode = 1;
  }
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  writeShipGate(process.cwd());
}
