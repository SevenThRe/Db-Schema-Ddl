import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  desktopSmokeArtifactSchema,
  releaseShipGateArtifactSchema,
  type DesktopSmokeArtifact,
  type ReleaseShipGateArtifact,
  type ReleaseShipGateFinding,
  type WorkbenchLiveVerificationArtifact,
  workbenchLiveVerificationArtifactSchema,
} from "../shared/release-verification";

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

export function evaluateReleaseShipGate(input: {
  packagedSmoke?: { path: string; artifact: DesktopSmokeArtifact } | null;
  liveArtifacts: { path: string; artifact: WorkbenchLiveVerificationArtifact }[];
}): ReleaseShipGateArtifact {
  const blockers: ReleaseShipGateFinding[] = [];
  const warnings: ReleaseShipGateFinding[] = [];
  const mysqlLive = input.liveArtifacts.find((entry) => entry.artifact.driver === "mysql");
  const postgresLive = input.liveArtifacts.find((entry) => entry.artifact.driver === "postgres");

  if (!input.packagedSmoke) {
    blockers.push({
      code: "PACKAGED_SMOKE_MISSING",
      severity: "blocking",
      message: "Missing packaged Tauri smoke artifact.",
    });
  } else {
    if (
      input.packagedSmoke.artifact.summary.overallStatus === "failed" ||
      input.packagedSmoke.artifact.blockerFindings.some((finding) => finding.blocker)
    ) {
      blockers.push({
        code: "PACKAGED_SMOKE_FAILED",
        severity: "blocking",
        message: "Packaged Tauri smoke artifact contains blockers or failed steps.",
        artifactPath: input.packagedSmoke.path,
      });
    } else if (input.packagedSmoke.artifact.summary.overallStatus === "warning") {
      warnings.push({
        code: "PACKAGED_SMOKE_WARNING",
        severity: "warning",
        message: "Packaged Tauri smoke artifact contains warnings.",
        artifactPath: input.packagedSmoke.path,
      });
    }
  }

  if (!mysqlLive) {
    blockers.push({
      code: "MYSQL_LIVE_VERIFICATION_MISSING",
      severity: "blocking",
      message: "Missing MySQL live verification artifact.",
    });
  } else if (mysqlLive.artifact.summary.overallStatus !== "passed") {
    blockers.push({
      code:
        mysqlLive.artifact.summary.overallStatus === "failed"
          ? "MYSQL_LIVE_VERIFICATION_FAILED"
          : "MYSQL_LIVE_VERIFICATION_INCOMPLETE",
      severity: "blocking",
      message:
        mysqlLive.artifact.summary.overallStatus === "failed"
          ? "MySQL live verification artifact contains failed flows."
          : "MySQL live verification artifact is incomplete and cannot satisfy the ship gate.",
      artifactPath: mysqlLive.path,
    });
  }

  if (!postgresLive) {
    blockers.push({
      code: "POSTGRES_LIVE_VERIFICATION_MISSING",
      severity: "blocking",
      message: "Missing PostgreSQL live verification artifact.",
    });
  } else if (postgresLive.artifact.summary.overallStatus !== "passed") {
    blockers.push({
      code:
        postgresLive.artifact.summary.overallStatus === "failed"
          ? "POSTGRES_LIVE_VERIFICATION_FAILED"
          : "POSTGRES_LIVE_VERIFICATION_INCOMPLETE",
      severity: "blocking",
      message:
        postgresLive.artifact.summary.overallStatus === "failed"
          ? "PostgreSQL live verification artifact contains failed flows."
          : "PostgreSQL live verification artifact is incomplete and cannot satisfy the ship gate.",
      artifactPath: postgresLive.path,
    });
  }

  return releaseShipGateArtifactSchema.parse({
    artifactVersion: "v1",
    runId: `ship-gate-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    generatedAt: new Date().toISOString(),
    decision: blockers.length > 0 ? "blocked" : "ready",
    blocked: blockers.length > 0,
    blockers,
    warnings,
    packagedSmokeArtifactPath: input.packagedSmoke?.path,
    liveArtifactPaths: input.liveArtifacts.map((entry) => entry.path),
    requiredEvidence: {
      packagedSmokePresent: Boolean(input.packagedSmoke),
      mysqlLivePresent: Boolean(mysqlLive),
      postgresLivePresent: Boolean(postgresLive),
    },
  });
}

function writeShipGate(cwd = process.cwd()) {
  const artifactDir = path.join(cwd, "artifacts", "release-verification");
  const packagedCandidates = listJsonArtifacts(artifactDir)
    .map((filePath) => ({
      path: filePath,
      artifact: tryParsePackagedSmoke(filePath),
    }))
    .find((entry) => entry.artifact !== null);
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
    packagedSmoke:
      packagedCandidates && packagedCandidates.artifact
        ? { path: packagedCandidates.path, artifact: packagedCandidates.artifact }
        : null,
    liveArtifacts,
  });

  const jsonPath = path.join(artifactDir, `${shipGate.runId}.json`);
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(shipGate, null, 2), "utf8");
  console.log(`ship gate artifact written:\n- ${jsonPath}`);
  if (shipGate.blocked) {
    process.exitCode = 1;
  }
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  writeShipGate(process.cwd());
}
