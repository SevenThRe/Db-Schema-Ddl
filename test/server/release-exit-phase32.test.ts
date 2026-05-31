import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  desktopSmokeArtifactSchema,
  lateHardeningVerificationArtifactSchema,
  releaseExitChecklistArtifactSchema,
  workbenchLiveVerificationPrereqArtifactSchema,
  workbenchLiveVerificationArtifactSchema,
} from "../../shared/release-verification";
import { collectReleaseVerificationArtifacts, evaluateReleaseShipGate } from "../../script/release-ship-gate";

function makePackagedSmoke(generatedAt: string) {
  return desktopSmokeArtifactSchema.parse({
    runId: "tauri-packaged-smoke-1",
    generatedAt,
    appVersion: "1.1.4",
    environment: "packaged-tauri",
    runMode: "packaged-tauri",
    logPath: "C:/tmp/tauri-packaged-smoke.log",
    steps: [
      { id: "startup", title: "startup", status: "passed" },
    ],
    summary: {
      passedCount: 1,
      failedCount: 0,
      warningCount: 0,
      skippedCount: 0,
      overallStatus: "passed",
    },
  });
}

function makeLiveArtifact(driver: "mysql" | "postgres", generatedAt: string) {
  return workbenchLiveVerificationArtifactSchema.parse({
    runId: `live-${driver}-1`,
    generatedAt,
    driver,
    flows: [
      { id: "connect", status: "passed" },
      { id: "query", status: "passed" },
      { id: "paging", status: "passed" },
      { id: "export", status: "passed" },
      { id: "cancel", status: "passed" },
      { id: "edit", status: "passed" },
      { id: "readonly", status: "passed" },
      { id: "inspection", status: "passed" },
    ],
    summary: {
      passedCount: 8,
      failedCount: 0,
      warningCount: 0,
      skippedCount: 0,
      overallStatus: "passed",
    },
  });
}

function makeLateHardeningProof(verifiedAt: string, status = "passed") {
  return lateHardeningVerificationArtifactSchema.parse({
    phase: "31-db-workbench-runtime-and-sync-hardening",
    status,
    verifiedAt,
    verificationPath: "E:/work/Db-Schema-Ddl/.planning/phases/31-db-workbench-runtime-and-sync-hardening/31-VERIFICATION.md",
  });
}

test("release exit checklist contract names the required evidence classes explicitly", () => {
  const parsed = releaseExitChecklistArtifactSchema.parse({
    runId: "release-exit-checklist-1",
    generatedAt: "2026-04-17T00:00:00.000Z",
    decision: "blocked",
    blocked: true,
    evidence: {
      packagedSmoke: {
        key: "packaged-smoke",
        label: "Packaged smoke",
        status: "current",
      },
      mysqlLive: {
        key: "mysql-live",
        label: "MySQL live verification",
        status: "missing",
        blockerCodes: ["MYSQL_LIVE_VERIFICATION_MISSING"],
      },
      postgresLive: {
        key: "postgres-live",
        label: "PostgreSQL live verification",
        status: "missing",
        blockerCodes: ["POSTGRES_LIVE_VERIFICATION_MISSING"],
      },
      lateHardening: {
        key: "late-hardening",
        label: "Late hardening proof",
        status: "current",
      },
    },
    missingEvidence: ["mysql-live", "postgres-live"],
    shipBlockers: [
      {
        code: "MYSQL_LIVE_VERIFICATION_MISSING",
        severity: "blocking",
        message: "Missing MySQL live verification artifact.",
      },
    ],
  });

  assert.equal(parsed.evidence.mysqlLive.required, true);
  assert.equal(parsed.evidence.postgresLive.required, true);
  assert.equal(parsed.evidence.lateHardening.key, "late-hardening");
});

test("ship gate fails closed when release-exit evidence is missing", () => {
  const gate = evaluateReleaseShipGate({
    packagedSmoke: null,
    liveArtifacts: [],
    lateHardening: null,
    now: new Date("2026-04-17T00:00:00.000Z"),
  });

  assert.equal(gate.blocked, true);
  assert.equal(gate.decision, "blocked");
  assert.ok(gate.releaseExitChecklist);
  assert.ok(gate.shipBlockers.some((blocker) => blocker.code === "PACKAGED_SMOKE_MISSING"));
  assert.ok(
    gate.shipBlockers.some((blocker) => blocker.code === "MYSQL_LIVE_VERIFICATION_MISSING"),
  );
  assert.ok(
    gate.shipBlockers.some((blocker) => blocker.code === "POSTGRES_LIVE_VERIFICATION_MISSING"),
  );
  assert.ok(
    gate.shipBlockers.some((blocker) => blocker.code === "LATE_HARDENING_PROOF_MISSING"),
  );
  assert.deepEqual(
    [...gate.missingEvidence].sort(),
    ["late-hardening", "mysql-live", "packaged-smoke", "postgres-live"],
  );
});

test("ship gate marks stale live or hardening proof when packaged smoke is newer", () => {
  const gate = evaluateReleaseShipGate({
    packagedSmoke: {
      path: "packaged.json",
      artifact: makePackagedSmoke("2026-04-17T10:00:00.000Z"),
    },
    liveArtifacts: [
      {
        path: "mysql.json",
        artifact: makeLiveArtifact("mysql", "2026-04-17T09:00:00.000Z"),
      },
      {
        path: "postgres.json",
        artifact: makeLiveArtifact("postgres", "2026-04-17T10:30:00.000Z"),
      },
    ],
    lateHardening: makeLateHardeningProof("2026-04-17T08:00:00.000Z"),
    now: new Date("2026-04-17T11:00:00.000Z"),
  });

  assert.ok(gate.releaseExitChecklist);
  assert.ok(gate.staleEvidence.includes("mysql-live"));
  assert.ok(gate.staleEvidence.includes("late-hardening"));
  assert.ok(gate.shipBlockers.some((blocker) => blocker.code === "MYSQL_LIVE_VERIFICATION_STALE"));
  assert.ok(gate.shipBlockers.some((blocker) => blocker.code === "LATE_HARDENING_PROOF_STALE"));
  assert.equal(gate.releaseExitChecklist?.evidence.postgresLive.status, "current");
});

test("release evidence discovery ignores prereq artifacts and still requires real live verification", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-release-gate-"));
  const artifactDir = path.join(tempDir, "artifacts", "release-verification");
  fs.mkdirSync(artifactDir, { recursive: true });

  const packagedSmoke = makePackagedSmoke("2026-05-10T12:40:00.000Z");
  fs.writeFileSync(
    path.join(artifactDir, "tauri-packaged-smoke-1.json"),
    JSON.stringify(packagedSmoke, null, 2),
    "utf8",
  );

  const prereqArtifact = workbenchLiveVerificationPrereqArtifactSchema.parse({
    runId: "workbench-live-prereq-mysql-1",
    generatedAt: "2026-05-10T12:41:00.000Z",
    driver: "mysql",
    connectionLabel: "CI MySQL",
    host: "127.0.0.1",
    port: 3306,
    database: "app",
    readonly: false,
    checks: [
      { id: "connection-input", status: "passed", note: "Bootstrap connection string provided." },
      { id: "bootstrap-config", status: "passed", note: "Resolved bootstrap target." },
      { id: "tcp-connectivity", status: "passed", note: "TCP connection succeeded." },
    ],
    summary: {
      passedCount: 3,
      failedCount: 0,
      warningCount: 0,
      skippedCount: 0,
      overallStatus: "passed",
    },
  });
  fs.writeFileSync(
    path.join(artifactDir, "workbench-live-prereq-mysql-1.json"),
    JSON.stringify(prereqArtifact, null, 2),
    "utf8",
  );

  const discovered = collectReleaseVerificationArtifacts(tempDir);
  assert.equal(discovered.packagedCandidates.length, 1);
  assert.equal(discovered.liveArtifacts.length, 0);

  const gate = evaluateReleaseShipGate({
    packagedSmoke: discovered.packagedCandidates[0] ?? null,
    liveArtifacts: discovered.liveArtifacts,
    lateHardening: null,
    now: new Date("2026-05-10T12:45:00.000Z"),
  });

  assert.ok(
    gate.shipBlockers.some((blocker) => blocker.code === "MYSQL_LIVE_VERIFICATION_MISSING"),
  );
  assert.equal(gate.releaseExitChecklist?.evidence.mysqlLive.status, "missing");
});
