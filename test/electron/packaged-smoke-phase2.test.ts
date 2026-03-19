import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildDesktopSmokeArtifact, renderDesktopSmokeMarkdown } from "../../script/desktop-smoke";
import {
  buildPackagedSmokeFailureFinding,
  extractPackagedCheckpointNames,
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
    path.join("C:/workspace/db-schema-ddl", "dist-electron", "win-unpacked", "DBSchemaExcel2DDL.exe"),
  );
});

test("packaged smoke extracts checkpoint names from timestamp-prefixed production logs", () => {
  const checkpoints = extractPackagedCheckpointNames(
    [
      '[2026-03-18T15:15:47.771Z] [checkpoint:server_bootstrap_ready] {"port":5000}',
      '[2026-03-18T15:15:48.289Z] app ready [checkpoint:browser_window_loaded] {"port":5000}',
      '[2026-03-18T15:15:50.266Z] shutdown [checkpoint:server_shutdown_complete]',
    ].join("\n"),
  );

  assert.deepEqual(checkpoints, [
    "server_bootstrap_ready",
    "browser_window_loaded",
    "server_shutdown_complete",
  ]);
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
        return '[2026-03-18T15:15:47.771Z] [checkpoint:server_bootstrap_ready] {"port":5000}\n';
      }

      return [
        '[2026-03-18T15:15:47.771Z] [checkpoint:server_bootstrap_ready] {"port":5000}',
        '[2026-03-18T15:15:48.289Z] [checkpoint:browser_window_loaded] {"port":5000}',
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

test("installer smoke helper records installer path, install directory, timestamps, and evidence refs", () => {
  const installerScriptPath = path.resolve("script/desktop-packaged-smoke-installer.ps1");
  const installerScript = fs.readFileSync(installerScriptPath, "utf8");

  assert.match(installerScript, /NSIS installer/i);
  assert.match(installerScript, /\$InstallerArtifactPath/);
  assert.match(installerScript, /\$InstallDirectory/);
  assert.match(installerScript, /startedAt/);
  assert.match(installerScript, /finishedAt/);
  assert.match(installerScript, /evidenceRefs/);
  assert.match(installerScript, /semi-manual/i);
  assert.match(installerScript, /blocker/i);
});

test("installer smoke helper accepts explicit screenshot and log evidence plus per-step outcomes", () => {
  const installerScriptPath = path.resolve("script/desktop-packaged-smoke-installer.ps1");
  const installerScript = fs.readFileSync(installerScriptPath, "utf8");

  assert.match(installerScript, /\$InstallerScreenshotPath/);
  assert.match(installerScript, /\$FirstLaunchScreenshotPath/);
  assert.match(installerScript, /\$PackagedLogPath/);
  assert.match(installerScript, /installer-ui-screenshot/);
  assert.match(installerScript, /first-launch-screenshot/);
  assert.match(installerScript, /packaged-log/);
  assert.match(installerScript, /stepResults/);
  assert.match(installerScript, /install/);
  assert.match(installerScript, /first-launch/);
  assert.match(installerScript, /db-entry/);
  assert.match(installerScript, /close/);
});

test("installer smoke helper preserves explicit per-step notes in findings and step results", () => {
  const installerScriptPath = path.resolve("script/desktop-packaged-smoke-installer.ps1");
  const packagedSmokeDocPath = path.resolve("docs/desktop-packaged-smoke.md");
  const installerScript = fs.readFileSync(installerScriptPath, "utf8");
  const packagedSmokeDoc = fs.readFileSync(packagedSmokeDocPath, "utf8");

  assert.match(installerScript, /\$InstallNote/);
  assert.match(installerScript, /\$FirstLaunchNote/);
  assert.match(installerScript, /\$DbEntryNote/);
  assert.match(installerScript, /\$CloseNote/);
  assert.match(installerScript, /Detail: \$StepNote/);
  assert.match(packagedSmokeDoc, /-DbEntryNote/);
  assert.match(packagedSmokeDoc, /-InstallNote/);
  assert.match(packagedSmokeDoc, /-FirstLaunchNote/);
  assert.match(packagedSmokeDoc, /-CloseNote/);
});

test("packaged smoke docs classify installer release blockers explicitly", () => {
  const packagedSmokeDocPath = path.resolve("docs/desktop-packaged-smoke.md");
  const packagedSmokeDoc = fs.readFileSync(packagedSmokeDocPath, "utf8");

  assert.match(packagedSmokeDoc, /win-unpacked/);
  assert.match(packagedSmokeDoc, /NSIS installer/);
  assert.match(packagedSmokeDoc, /release blocker/i);
  assert.match(packagedSmokeDoc, /startup failure/i);
  assert.match(packagedSmokeDoc, /native module load failure/i);
  assert.match(packagedSmokeDoc, /migration failure/i);
  assert.match(packagedSmokeDoc, /close/i);
  assert.match(packagedSmokeDoc, /catalog/i);
  assert.match(packagedSmokeDoc, /DB 管理/);
});

test("installer smoke docs require screenshot and packaged log attachments for NSIS review", () => {
  const packagedSmokeDocPath = path.resolve("docs/desktop-packaged-smoke.md");
  const packagedSmokeDoc = fs.readFileSync(packagedSmokeDocPath, "utf8");

  assert.match(packagedSmokeDoc, /installer UI screenshot/i);
  assert.match(packagedSmokeDoc, /first-launch screenshot/i);
  assert.match(packagedSmokeDoc, /packaged log excerpt/i);
  assert.match(packagedSmokeDoc, /install -> first launch -> `DB 管理` -> close/i);
});

test("installer packaged smoke stays structured even when the run is semi-manual", () => {
  const installerScriptPath = path.resolve("script/desktop-packaged-smoke-installer.ps1");
  const packagedSmokeDocPath = path.resolve("docs/desktop-packaged-smoke.md");
  const installerScript = fs.readFileSync(installerScriptPath, "utf8");
  const packagedSmokeDoc = fs.readFileSync(packagedSmokeDocPath, "utf8");

  assert.match(installerScript, /\$SemiManual/);
  assert.match(installerScript, /artifactJsonPath/);
  assert.match(installerScript, /artifactMarkdownPath/);
  assert.match(installerScript, /ManualEvidence/);
  assert.match(packagedSmokeDoc, /semi-manual/i);
  assert.match(packagedSmokeDoc, /JSON artifact/i);
  assert.match(packagedSmokeDoc, /Markdown summary/i);
});

test("installer packaged smoke keeps incomplete proof explicit instead of implying success", () => {
  const installerScriptPath = path.resolve("script/desktop-packaged-smoke-installer.ps1");
  const installerScript = fs.readFileSync(installerScriptPath, "utf8");

  assert.match(installerScript, /proofStatus/);
  assert.match(installerScript, /INSTALLER_UI_SCREENSHOT_MISSING/);
  assert.match(installerScript, /FIRST_LAUNCH_SCREENSHOT_MISSING/);
  assert.match(installerScript, /PACKAGED_LOG_MISSING/);
  assert.match(installerScript, /STEP_RESULT_PENDING/);
});
