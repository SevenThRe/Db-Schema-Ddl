import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopSmokeArtifactSchema,
  lateHardeningVerificationArtifactSchema,
  releaseExitChecklistArtifactSchema,
  workbenchLiveVerificationArtifactSchema,
} from "../../shared/release-verification";
import { evaluateReleaseShipGate } from "../../script/release-ship-gate";

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
