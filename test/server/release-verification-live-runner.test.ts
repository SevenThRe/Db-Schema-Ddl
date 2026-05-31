import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkbenchLiveVerificationPrereqArtifact,
  buildLiveVerificationEnvOverrides,
  parseCompletedMetadata,
  parseFlowCheckpoints,
  probeTcpEndpoint,
  renderWorkbenchLiveVerificationPrereqMarkdown,
  resolveLiveVerificationTargetArgs,
  resolveLiveVerificationPrereqTarget,
  shouldFailLiveVerificationPrereq,
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

test("live verification lab mode resolves connection strings from DB lab port config", () => {
  const mysql = resolveLiveVerificationTargetArgs({
    driver: "mysql",
    lab: true,
    env: {
      DBTOOLS_MYSQL_PORT: "13306",
      DBTOOLS_POSTGRES_PORT: "15432",
    },
  });
  const postgres = resolveLiveVerificationTargetArgs({
    driver: "postgres",
    lab: true,
    env: {
      DBTOOLS_MYSQL_PORT: "13306",
      DBTOOLS_POSTGRES_PORT: "15432",
    },
  });

  assert.equal(
    mysql.connectionString,
    "mysql://dbtools_writable:dbtools_writable@127.0.0.1:13306/dbtools_lab",
  );
  assert.equal(mysql.defaultSchema, undefined);
  assert.equal(
    postgres.connectionString,
    "postgres://dbtools_writable:dbtools_writable@127.0.0.1:15432/dbtools_lab?schema=app",
  );
  assert.equal(postgres.defaultSchema, "app");
});

test("live verification lab mode does not override explicit connection strings", () => {
  const resolved = resolveLiveVerificationTargetArgs({
    driver: "mysql",
    lab: true,
    connectionString: "mysql://operator:secret@db.internal:3307/app",
    defaultSchema: "custom",
    env: {
      DBTOOLS_MYSQL_PORT: "13306",
    },
  });

  assert.equal(
    resolved.connectionString,
    "mysql://operator:secret@db.internal:3307/app",
  );
  assert.equal(resolved.defaultSchema, "custom");
});

test("live verification prereq resolves bootstrap target details from connection string", () => {
  const prereq = resolveLiveVerificationPrereqTarget({
    driver: "mysql",
    connectionName: "CI MySQL",
    connectionString: "mysql://root:secret@127.0.0.1:3307/app",
    readonly: false,
  });

  assert.equal(prereq.connectionLabel, "CI MySQL");
  assert.equal(prereq.host, "127.0.0.1");
  assert.equal(prereq.port, 3307);
  assert.equal(prereq.database, "app");
  assert.equal(prereq.checks.find((check) => check.id === "bootstrap-config")?.status, "passed");
});

test("live verification prereq warns when only a saved connection selector is available", () => {
  const prereq = resolveLiveVerificationPrereqTarget({
    driver: "postgres",
    connectionName: "Saved Postgres",
  });

  assert.equal(prereq.connectionLabel, "Saved Postgres");
  assert.equal(prereq.host, undefined);
  assert.equal(prereq.checks.find((check) => check.id === "bootstrap-config")?.status, "warning");
});

test("live verification prereq tcp probe reports passed for a reachable local endpoint", async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    const check = await probeTcpEndpoint({
      host: "127.0.0.1",
      port: (address as net.AddressInfo).port,
      timeoutMs: 1000,
    });

    assert.equal(check.status, "passed");
    assert.match(check.note ?? "", /TCP connection succeeded/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("live verification prereq artifact renders markdown with prereq checks", () => {
  const artifact = buildWorkbenchLiveVerificationPrereqArtifact({
    runId: "workbench-live-prereq-mysql-1",
    generatedAt: "2026-05-10T12:45:00.000Z",
    driver: "mysql",
    connectionLabel: "CI MySQL",
    host: "127.0.0.1",
    port: 3306,
    database: "app",
    readonly: false,
    checks: [
      { id: "connection-input", status: "passed", note: "Bootstrap connection string provided." },
      { id: "bootstrap-config", status: "passed", note: "Resolved bootstrap target 127.0.0.1:3306/app." },
      { id: "tcp-connectivity", status: "passed", note: "TCP connection succeeded to 127.0.0.1:3306." },
    ],
  });

  const markdown = renderWorkbenchLiveVerificationPrereqMarkdown(artifact);
  assert.match(markdown, /DB Workbench Live Verification Prereq mysql/);
  assert.match(markdown, /\| tcp-connectivity \| passed \|/);
  assert.equal(artifact.summary.overallStatus, "passed");
});

test("live verification prereq fails the command only when prereq status is failed", () => {
  const advisoryArtifact = buildWorkbenchLiveVerificationPrereqArtifact({
    runId: "workbench-live-prereq-postgres-1",
    generatedAt: "2026-05-10T13:15:00.000Z",
    driver: "postgres",
    connectionLabel: "Saved Postgres",
    checks: [
      { id: "connection-input", status: "passed", note: "Saved connection selector provided." },
      { id: "bootstrap-config", status: "warning", note: "Saved-connection prereq mode is advisory only." },
      { id: "tcp-connectivity", status: "skipped", note: "TCP reachability probe was skipped." },
    ],
  });

  const failedArtifact = buildWorkbenchLiveVerificationPrereqArtifact({
    runId: "workbench-live-prereq-mysql-2",
    generatedAt: "2026-05-10T13:16:00.000Z",
    driver: "mysql",
    connectionLabel: "CI MySQL",
    host: "127.0.0.1",
    port: 3306,
    database: "app",
    checks: [
      { id: "connection-input", status: "passed", note: "Bootstrap connection string provided." },
      { id: "bootstrap-config", status: "passed", note: "Resolved bootstrap target." },
      { id: "tcp-connectivity", status: "failed", note: "TCP probe failed for 127.0.0.1:3306: ECONNREFUSED." },
    ],
  });

  assert.equal(advisoryArtifact.summary.overallStatus, "warning");
  assert.equal(shouldFailLiveVerificationPrereq(advisoryArtifact), false);
  assert.equal(failedArtifact.summary.overallStatus, "failed");
  assert.equal(shouldFailLiveVerificationPrereq(failedArtifact), true);
});
