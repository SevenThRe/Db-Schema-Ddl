import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopSmokeArtifactSchema,
  workbenchLiveVerificationArtifactSchema,
} from "../../shared/release-verification";
import { runDesktopPreflight } from "../../script/desktop-preflight";
import { evaluateReleaseShipGate } from "../../script/release-ship-gate";

test("tauri desktop smoke artifact captures recovery classification and observed checkpoints", () => {
  const parsed = desktopSmokeArtifactSchema.parse({
    runId: "tauri-smoke-1",
    generatedAt: "2026-04-12T00:00:00.000Z",
    appVersion: "1.1.4",
    environment: "packaged-tauri",
    runMode: "packaged-tauri",
    logPath: "C:/tmp/tauri-smoke.log",
    observedCheckpoints: [
      { name: "tauri_setup_ready", metadata: {} },
      {
        name: "db_workbench_recovery_classified",
        metadata: { classification: "restored" },
      },
    ],
    recoveryClassification: "restored",
    steps: [
      { id: "startup", title: "Tauri startup", status: "passed" },
    ],
    summary: {
      passedCount: 1,
      failedCount: 0,
      warningCount: 0,
      skippedCount: 0,
      overallStatus: "passed",
    },
  });

  assert.equal(parsed.environment, "packaged-tauri");
  assert.equal(parsed.recoveryClassification, "restored");
  assert.equal(parsed.observedCheckpoints[1]?.name, "db_workbench_recovery_classified");
});

test("ship gate fails closed when required packaged or driver evidence is missing", () => {
  const mysqlLive = workbenchLiveVerificationArtifactSchema.parse({
    runId: "live-mysql-1",
    generatedAt: "2026-04-12T00:00:00.000Z",
    driver: "mysql",
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

  const gate = evaluateReleaseShipGate({
    packagedSmoke: null,
    liveArtifacts: [{ path: "mysql.json", artifact: mysqlLive }],
  });

  assert.equal(gate.blocked, true);
  assert.equal(gate.decision, "blocked");
  assert.ok(gate.blockers.some((blocker) => blocker.code === "PACKAGED_SMOKE_MISSING"));
  assert.ok(
    gate.blockers.some((blocker) => blocker.code === "POSTGRES_LIVE_VERIFICATION_MISSING"),
  );
});

test("desktop preflight targets the current tauri verification seam", () => {
  const result = runDesktopPreflight(process.cwd());

  assert.equal(result.ok, true);
  assert.ok(result.checks.some((check) => check.id === "tauri-verification-scripts" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "smoke-checkpoint-command" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "frontend-smoke-entry" && check.ok));
});
