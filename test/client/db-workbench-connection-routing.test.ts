import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSchemaDiffTargetConnectionId,
  resolveSyncConnectionIds,
} from "../../client/src/components/extensions/db-workbench/workbench-connection-routing";
import { buildWorkbenchConnectionContext } from "../../client/src/components/extensions/db-workbench/workbench-connection-context";
import type { DbConnectionConfig } from "../../shared/schema";

const connections = [{ id: "source" }, { id: "target-a" }, { id: "target-b" }];

function makeConnection(
  id: string,
  name: string,
  database = `${id}_db`,
): DbConnectionConfig {
  return {
    id,
    name,
    driver: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database,
    username: "root",
    password: "",
    environment: "dev",
  };
}

test("connection routing keeps an explicit schema diff target when it remains valid", () => {
  assert.equal(
    resolveSchemaDiffTargetConnectionId({
      activeConnectionId: "source",
      currentTargetConnectionId: "target-b",
      connections,
    }),
    "target-b",
  );
});

test("connection routing falls schema diff back to another connection only", () => {
  assert.equal(
    resolveSchemaDiffTargetConnectionId({
      activeConnectionId: "source",
      currentTargetConnectionId: "source",
      connections,
    }),
    "target-a",
  );
  assert.equal(
    resolveSchemaDiffTargetConnectionId({
      activeConnectionId: "source",
      currentTargetConnectionId: "",
      connections: [{ id: "source" }],
    }),
    "",
  );
});

test("connection routing prevents data sync target from silently matching source when alternatives exist", () => {
  assert.deepEqual(
    resolveSyncConnectionIds({
      activeConnectionId: "source",
      currentSourceConnectionId: "source",
      currentTargetConnectionId: "source",
      connections,
    }),
    {
      sourceConnectionId: "source",
      targetConnectionId: "target-a",
    },
  );
});

test("connection routing repairs stale data sync source and target ids", () => {
  assert.deepEqual(
    resolveSyncConnectionIds({
      activeConnectionId: "target-a",
      currentSourceConnectionId: "missing-source",
      currentTargetConnectionId: "missing-target",
      connections,
    }),
    {
      sourceConnectionId: "target-a",
      targetConnectionId: "source",
    },
  );
});

test("workbench connection context centralizes schema diff and sync targets", () => {
  const source = makeConnection("source", "Source", "app");
  const targetA = makeConnection("target-a", "Target A", "stage");
  const targetB = makeConnection("target-b", "Target B", "prod");
  const context = buildWorkbenchConnectionContext({
    connection: source,
    connections: [source, targetA, targetB],
    schemaDiffTargetConnectionId: "target-b",
    syncSourceConnectionId: "target-a",
    syncTargetConnectionId: "missing-target",
  });

  assert.equal(context.sourceConnectionLabel, "Source");
  assert.equal(context.schemaDiffTargetConnectionLabel, "Target B");
  assert.deepEqual(context.schemaDiffConnectionOptions.map((item) => item.id), [
    "source",
    "target-a",
    "target-b",
  ]);
  assert.equal(context.activeSyncSourceConnection.id, "target-a");
  assert.equal(context.activeSyncTargetConnection.id, "source");
});

test("workbench connection context preserves no-saved-connection fallback", () => {
  const source = makeConnection("source", "", "app");
  const context = buildWorkbenchConnectionContext({
    connection: source,
    connections: [],
    schemaDiffTargetConnectionId: "source",
    syncSourceConnectionId: "missing-source",
    syncTargetConnectionId: "missing-target",
  });

  assert.equal(context.sourceConnectionLabel, "app");
  assert.equal(context.schemaDiffTargetConnectionLabel, null);
  assert.deepEqual(context.syncConnectionOptions.map((item) => item.id), [
    "source",
  ]);
  assert.equal(context.activeSyncSourceConnection.id, "source");
  assert.equal(context.activeSyncTargetConnection.id, "source");
});
