import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveVerificationEnvOverrides,
  parseCompletedMetadata,
  parseFlowCheckpoints,
} from "../../script/workbench-live-verification";

test("live verification parser reads flow checkpoints and completion metadata from smoke log", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-workbench-live-"));
  const logPath = path.join(tempDir, "live.log");
  fs.writeFileSync(
    logPath,
    [
      '[checkpoint:db_workbench_live_flow] {"driver":"mysql","flowId":"connect","status":"passed","note":"connected"}',
      '[checkpoint:db_workbench_live_flow] {"driver":"mysql","flowId":"query","status":"passed","note":"query ok"}',
      '[checkpoint:db_workbench_live_completed] {"driver":"mysql","connectionName":"Local MySQL","database":"app","readonly":false,"status":"passed","note":"done"}',
    ].join("\n"),
    "utf8",
  );

  const flows = parseFlowCheckpoints(logPath, "mysql");
  const completion = parseCompletedMetadata(logPath, "mysql");

  assert.equal(flows.find((flow) => flow.id === "connect")?.status, "passed");
  assert.equal(flows.find((flow) => flow.id === "query")?.note, "query ok");
  assert.equal(flows.find((flow) => flow.id === "export")?.status, "skipped");
  assert.equal(completion.connectionLabel, "Local MySQL");
  assert.equal(completion.database, "app");
  assert.equal(completion.readonly, false);
  assert.equal(completion.completionStatus, "passed");
});

test("live verification runner forwards bootstrap connection-string inputs into tauri env overrides", () => {
  const env = buildLiveVerificationEnvOverrides({
    driver: "postgres",
    connectionName: "CI Postgres",
    connectionString: "postgresql://app:secret@db.internal:5432/workbench",
    readonly: true,
    defaultSchema: "public",
  });

  assert.equal(env.DBSCHEMA_LIVE_VERIFY_DRIVER, "postgres");
  assert.equal(env.DBSCHEMA_LIVE_VERIFY_CONNECTION_NAME, "CI Postgres");
  assert.equal(
    env.DBSCHEMA_LIVE_VERIFY_CONNECTION_STRING,
    "postgresql://app:secret@db.internal:5432/workbench",
  );
  assert.equal(env.DBSCHEMA_LIVE_VERIFY_READONLY, "1");
  assert.equal(env.DBSCHEMA_LIVE_VERIFY_DEFAULT_SCHEMA, "public");
});
