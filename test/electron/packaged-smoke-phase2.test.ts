import test from "node:test";
import assert from "node:assert/strict";
import { buildDesktopSmokeArtifact, renderDesktopSmokeMarkdown } from "../../script/desktop-smoke";
import {
  buildPackagedSmokeFailureFinding,
  resolvePackagedExecutablePath,
  waitForPackagedCheckpointEvidence,
} from "../../script/desktop-packaged-smoke";

test("packaged smoke artifact exposes structured packaged evidence", () => {
  const artifact = buildDesktopSmokeArtifact({
    runId: "desktop-smoke-packaged-001",
    generatedAt: "2026-03-18T22:30:00.000Z",
    appVersion: "1.1.4",
    environment: "packaged-electron",
    runMode: "packaged-win-unpacked",
    logPath: "C:/Users/tester/AppData/Roaming/DBSchemaExcel2DDL/logs/main.log",
    executablePath: "C:/builds/win-unpacked/DBSchemaExcel2DDL.exe",
    screenshotPaths: [
      "C:/artifacts/desktop-smoke/win-unpacked-main-window.png",
      "C:/artifacts/desktop-smoke/win-unpacked-db-management.png",
    ],
    logExcerpt: {
      path: "C:/Users/tester/AppData/Roaming/DBSchemaExcel2DDL/logs/main.log",
      excerpt: "browser_window_loaded\nextension_catalog_fetch_failed",
      startLine: 18,
      endLine: 19,
    },
    blockerFindings: [
      {
        code: "EXTENSION_ENTRY_BLOCKED",
        blocker: true,
        severity: "critical",
        message: "DB 管理入口未能打开。",
      },
    ],
    steps: [],
  });

  assert.equal(artifact.runMode, "packaged-win-unpacked");
  assert.equal(artifact.executablePath, "C:/builds/win-unpacked/DBSchemaExcel2DDL.exe");
  assert.deepEqual(artifact.screenshotPaths, [
    "C:/artifacts/desktop-smoke/win-unpacked-main-window.png",
    "C:/artifacts/desktop-smoke/win-unpacked-db-management.png",
  ]);
  assert.deepEqual(artifact.logExcerpt, {
    path: "C:/Users/tester/AppData/Roaming/DBSchemaExcel2DDL/logs/main.log",
    excerpt: "browser_window_loaded\nextension_catalog_fetch_failed",
    startLine: 18,
    endLine: 19,
  });
  assert.deepEqual(artifact.blockerFindings, [
    {
      code: "EXTENSION_ENTRY_BLOCKED",
      blocker: true,
      severity: "critical",
      message: "DB 管理入口未能打开。",
    },
  ]);
});

test("packaged smoke recognizes win-unpacked and nsis as first-class run modes", () => {
  const winUnpackedArtifact = buildDesktopSmokeArtifact({
    runId: "desktop-smoke-packaged-002",
    generatedAt: "2026-03-18T22:31:00.000Z",
    appVersion: "1.1.4",
    environment: "packaged-electron",
    runMode: "packaged-win-unpacked",
    logPath: "C:/logs/win-unpacked.log",
    executablePath: "C:/builds/win-unpacked/DBSchemaExcel2DDL.exe",
    steps: [],
  });

  const nsisArtifact = buildDesktopSmokeArtifact({
    runId: "desktop-smoke-packaged-003",
    generatedAt: "2026-03-18T22:32:00.000Z",
    appVersion: "1.1.4",
    environment: "packaged-electron",
    runMode: "packaged-nsis",
    logPath: "C:/logs/nsis.log",
    executablePath: "C:/Program Files/DBSchemaExcel2DDL/DBSchemaExcel2DDL.exe",
    steps: [],
  });

  assert.equal(winUnpackedArtifact.runMode, "packaged-win-unpacked");
  assert.equal(nsisArtifact.runMode, "packaged-nsis");
});

test("packaged markdown and json evidence derive from the same artifact", () => {
  const artifact = buildDesktopSmokeArtifact({
    runId: "desktop-smoke-packaged-004",
    generatedAt: "2026-03-18T22:33:00.000Z",
    appVersion: "1.1.4",
    environment: "packaged-electron",
    runMode: "packaged-nsis",
    logPath: "C:/logs/nsis.log",
    executablePath: "C:/Program Files/DBSchemaExcel2DDL/DBSchemaExcel2DDL.exe",
    screenshotPaths: ["C:/artifacts/desktop-smoke/nsis-main-window.png"],
    logExcerpt: {
      path: "C:/logs/nsis.log",
      excerpt: "app_ready",
    },
    blockerFindings: [
      {
        code: "PACKAGED_STARTUP_READY",
        blocker: false,
        severity: "warning",
        message: "Packaged startup completed with one non-blocking warning.",
      },
    ],
    steps: [],
  });

  const markdown = renderDesktopSmokeMarkdown(artifact);
  const jsonArtifact = JSON.parse(JSON.stringify(artifact));

  assert.equal(jsonArtifact.runId, artifact.runId);
  assert.equal(jsonArtifact.runMode, artifact.runMode);
  assert.equal(jsonArtifact.executablePath, artifact.executablePath);
  assert.deepEqual(jsonArtifact.screenshotPaths, artifact.screenshotPaths);
  assert.deepEqual(jsonArtifact.blockerFindings, artifact.blockerFindings);

  assert.match(markdown, /Desktop Smoke Run desktop-smoke-packaged-004/);
  assert.match(markdown, /packaged-nsis/);
  assert.match(markdown, /C:\/Program Files\/DBSchemaExcel2DDL\/DBSchemaExcel2DDL\.exe/);
  assert.match(markdown, /C:\/artifacts\/desktop-smoke\/nsis-main-window\.png/);
  assert.match(markdown, /PACKAGED_STARTUP_READY/);
});

test("packaged smoke resolves the win-unpacked executable path", () => {
  const executablePath = resolvePackagedExecutablePath("C:/workspace/db-schema-ddl");

  assert.equal(
    executablePath,
    "C:/workspace/db-schema-ddl/dist-electron/win-unpacked/DBSchemaExcel2DDL.exe",
  );
});

test("packaged smoke waits for readiness checkpoints instead of fixed sleep alone", async () => {
  const sleeps: number[] = [];
  let readCount = 0;

  const result = await waitForPackagedCheckpointEvidence({
    logPath: "C:/logs/dbschemaexcel2ddl-bootstrap.log",
    timeoutMs: 2000,
    pollIntervalMs: 25,
    existsSync: () => true,
    readFile: async () => {
      readCount += 1;
      if (readCount === 1) {
        return '[checkpoint:server_bootstrap_ready] {"port":5000}\n';
      }

      return [
        '[checkpoint:server_bootstrap_ready] {"port":5000}',
        '[checkpoint:browser_window_loaded] {"port":5000}',
      ].join("\n");
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.missingCheckpoints, []);
  assert.deepEqual(result.observedCheckpoints, [
    "server_bootstrap_ready",
    "browser_window_loaded",
  ]);
  assert.equal(sleeps.length, 1);
  assert.equal(readCount, 2);
});

test("packaged smoke emits blocker findings for launch, readiness, and shutdown failures", () => {
  const launchFinding = buildPackagedSmokeFailureFinding("launch", new Error("spawn EACCES"));
  const readinessFinding = buildPackagedSmokeFailureFinding("readiness", "checkpoint timeout");
  const shutdownFinding = buildPackagedSmokeFailureFinding("shutdown", new Error("window still alive"));

  assert.deepEqual(
    [launchFinding, readinessFinding, shutdownFinding].map((finding) => ({
      code: finding.code,
      blocker: finding.blocker,
      severity: finding.severity,
    })),
    [
      { code: "PACKAGED_LAUNCH_FAILED", blocker: true, severity: "critical" },
      { code: "PACKAGED_READINESS_FAILED", blocker: true, severity: "critical" },
      { code: "PACKAGED_SHUTDOWN_FAILED", blocker: true, severity: "critical" },
    ],
  );
  assert.match(launchFinding.message, /spawn EACCES/);
  assert.match(readinessFinding.message, /checkpoint timeout/);
  assert.match(shutdownFinding.message, /window still alive/);
});
