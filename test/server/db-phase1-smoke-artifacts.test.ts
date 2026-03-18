import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopDiagnosticEntrySchema,
  desktopSmokeArtifactSchema,
} from "../../shared/schema";

test("desktop diagnostic entries expose stable machine-usable fields", () => {
  const parsed = desktopDiagnosticEntrySchema.parse({
    id: "diag:startup:1",
    timestamp: "2026-03-18T20:30:00.000Z",
    source: "electron-main",
    severity: "error",
    category: "startup_failed",
    code: "STARTUP_HTTP_SERVER_FAILED",
    message: "Failed to start Express server.",
    entityKey: "startup:http-server",
    metadata: {
      phase: "bootstrap",
      attempt: 1,
    },
  });

  assert.equal(parsed.source, "electron-main");
  assert.equal(parsed.category, "startup_failed");
  assert.equal(parsed.code, "STARTUP_HTTP_SERVER_FAILED");
  assert.equal(parsed.entityKey, "startup:http-server");
  assert.equal(parsed.metadata.phase, "bootstrap");
});

test("desktop smoke artifact captures reusable evidence for humans and automation", () => {
  const parsed = desktopSmokeArtifactSchema.parse({
    runId: "smoke:2026-03-18:1",
    generatedAt: "2026-03-18T20:31:00.000Z",
    appVersion: "1.1.4",
    environment: "dev-electron",
    logPath: "C:/Users/example/AppData/Roaming/DBSchemaExcel2DDL/logs/dbschemaexcel2ddl-bootstrap.log",
    summary: {
      passedCount: 4,
      failedCount: 0,
      warningCount: 1,
      skippedCount: 0,
      overallStatus: "warning",
    },
    diagnostics: [
      {
        id: "diag:extension:1",
        timestamp: "2026-03-18T20:31:01.000Z",
        source: "extension-delivery",
        severity: "warn",
        category: "extension_catalog_unavailable",
        code: "CATALOG_NOT_PUBLISHED",
        message: "官方扩展暂未发布，当前还没有可下载的安装包。",
      },
    ],
    steps: [
      {
        id: "startup",
        title: "应用启动",
        status: "passed",
      },
      {
        id: "extension-entry",
        title: "扩展入口检查",
        status: "warning",
        diagnosticIds: ["diag:extension:1"],
      },
    ],
  });

  assert.equal(parsed.artifactVersion, "v1");
  assert.equal(parsed.summary.warningCount, 1);
  assert.equal(parsed.steps[1]?.diagnosticIds[0], "diag:extension:1");
  assert.equal(parsed.diagnostics[0]?.category, "extension_catalog_unavailable");
});
