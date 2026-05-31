import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildReleaseVerificationBootstrapConfig,
  parseConnectionString,
} from "../../client/src/lib/db-connection-string";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("release verification bootstrap builds a deterministic saved connection from a connection string", () => {
  const result = buildReleaseVerificationBootstrapConfig({
    driver: "mysql",
    connectionName: "CI MySQL",
    connectionString: "mysql://root:secret@db.internal:3307/app",
    readonly: true,
    defaultSchema: "app",
  });

  assert.equal(result.error, undefined);
  assert.ok(result.config);
  assert.equal(result.config?.id, "__release-verification__mysql");
  assert.equal(result.config?.name, "CI MySQL");
  assert.equal(result.config?.driver, "mysql");
  assert.equal(result.config?.host, "db.internal");
  assert.equal(result.config?.port, 3307);
  assert.equal(result.config?.database, "app");
  assert.equal(result.config?.username, "root");
  assert.equal(result.config?.password, "secret");
  assert.equal(result.config?.readonly, true);
  assert.equal(result.config?.defaultSchema, "app");
  assert.equal(result.config?.groupName, "Release Verification");
});

test("release verification bootstrap rejects connection strings whose parsed driver mismatches the requested driver", () => {
  const result = buildReleaseVerificationBootstrapConfig({
    driver: "postgres",
    connectionString: "mysql://root:secret@db.internal:3306/app",
  });

  assert.equal(result.config, null);
  assert.match(result.error ?? "", /driver mismatch/i);
});

test("shared connection-string parser still accepts env-style inputs for verification bootstrap", () => {
  const parsed = parseConnectionString(
    "DB_DRIVER=postgres DB_HOST=localhost DB_PORT=5432 DB_NAME=workbench DB_USER=app DB_PASSWORD=secret",
  );

  assert.equal(parsed?.driver, "postgres");
  assert.equal(parsed?.host, "localhost");
  assert.equal(parsed?.port, 5432);
  assert.equal(parsed?.database, "workbench");
  assert.equal(parsed?.username, "app");
  assert.equal(parsed?.password, "secret");
});

test("live verification completion checkpoint is still emitted from WorkbenchLayout terminal paths", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const liveEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-live-verification-effects.ts",
  );
  const layoutEffects = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-effects.ts",
  );
  const sessionRunner = await read(
    "client/src/components/extensions/db-workbench/live-verification-session-runner.ts",
  );

  assert.match(workbench, /useWorkbenchLayoutEffects\(\{/);
  assert.match(layoutEffects, /useWorkbenchLiveVerificationEffects\(\{/);
  assert.match(liveEffects, /startWorkbenchLiveVerificationSession\(\{/);
  assert.match(sessionRunner, /const complete = async \(/);
  assert.match(sessionRunner, /await input\.emitCompletedCheckpoint\(/);
  assert.doesNotMatch(
    sessionRunner,
    /const complete = async \([\s\S]*?if \(cancelled\) return;[\s\S]*?await input\.emitCompletedCheckpoint\(/,
  );
});

test("db connector runtime hook owns live verification connection bootstrap", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );
  const controller = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-controller.ts",
  );
  const runtimeEffects = await read(
    "client/src/components/extensions/db-workbench/use-db-connector-workspace-runtime-effects.ts",
  );

  assert.match(workspace, /useDbConnectorWorkspaceController\(\{/);
  assert.match(controller, /useDbConnectorWorkspaceRuntimeEffects\(\{/);
  assert.match(runtimeEffects, /buildReleaseVerificationBootstrapConfig/);
  assert.match(runtimeEffects, /resolveLiveVerificationConnection/);
  assert.match(runtimeEffects, /saveConnectionAsync\(normalizeConnectionConfig\(liveVerificationBootstrap\.config\)\)/);
  assert.match(runtimeEffects, /emitLiveVerificationFlow\("connect", "failed"/);
  assert.doesNotMatch(workspace, /buildReleaseVerificationBootstrapConfig/);
  assert.doesNotMatch(workspace, /emitLiveVerificationCompleted/);
});
