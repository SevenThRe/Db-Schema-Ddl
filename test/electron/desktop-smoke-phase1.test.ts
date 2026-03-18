import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesktopSmokeArtifact,
  createDesktopSmokeChecklist,
  DESKTOP_SMOKE_STEP_IDS,
  renderDesktopSmokeMarkdown,
} from "../../script/desktop-smoke";

test("desktop smoke checklist covers the required runtime path", () => {
  const checklist = createDesktopSmokeChecklist();
  const ids = new Set(checklist.map((step) => step.id));

  assert.equal(ids.has(DESKTOP_SMOKE_STEP_IDS.startup), true);
  assert.equal(ids.has(DESKTOP_SMOKE_STEP_IDS.sqliteInit), true);
  assert.equal(ids.has(DESKTOP_SMOKE_STEP_IDS.extensionEntry), true);
  assert.equal(ids.has(DESKTOP_SMOKE_STEP_IDS.dbManagementMysqlRead), true);
  assert.equal(ids.has(DESKTOP_SMOKE_STEP_IDS.shutdown), true);
});

test("desktop smoke artifact summary is deterministic and markdown references the same run", () => {
  const artifact = buildDesktopSmokeArtifact({
    runId: "desktop-smoke-001",
    generatedAt: "2026-03-18T21:00:00.000Z",
    appVersion: "1.1.4",
    environment: "dev-electron",
    logPath: "C:/logs/dbschemaexcel2ddl-bootstrap.log",
    diagnostics: [
      {
        id: "diag-1",
        timestamp: "2026-03-18T21:00:01.000Z",
        source: "desktop-smoke",
        severity: "warn",
        category: "extension_catalog_unavailable",
        code: "CATALOG_NOT_PUBLISHED",
        message: "官方扩展暂未发布，当前还没有可下载的安装包。",
      },
    ],
    steps: [
      {
        id: DESKTOP_SMOKE_STEP_IDS.startup,
        title: "应用启动",
        status: "passed",
        diagnosticIds: [],
      },
      {
        id: DESKTOP_SMOKE_STEP_IDS.shutdown,
        title: "应用关闭",
        status: "warning",
        detail: "Observed one non-blocking warning.",
        diagnosticIds: ["diag-1"],
      },
    ],
  });

  assert.equal(artifact.summary.passedCount, 1);
  assert.equal(artifact.summary.warningCount, 1);
  assert.equal(artifact.summary.overallStatus, "warning");

  const markdown = renderDesktopSmokeMarkdown(artifact);
  assert.match(markdown, /Desktop Smoke Run desktop-smoke-001/);
  assert.match(markdown, /C:\/logs\/dbschemaexcel2ddl-bootstrap\.log/);
  assert.match(markdown, /CATALOG_NOT_PUBLISHED/);
});
