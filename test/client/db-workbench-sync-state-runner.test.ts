import test from "node:test";
import assert from "node:assert/strict";
import type { SetStateAction } from "react";
import type { SyncTableConfigDraft } from "../../client/src/components/extensions/db-workbench/data-sync-utils";
import {
  createSyncConnectionStateActions,
  runClearDataSyncArtifacts,
  runReconcileDataSyncTables,
  runResolveDataSyncConnections,
  runResolveSchemaDiffTarget,
  runResetSchemaDiffForConnection,
  runResetSchemaDiffForTarget,
} from "../../client/src/components/extensions/db-workbench/workbench-sync-state-runner";

function applyState<T>(current: T, action: SetStateAction<T>): T {
  return typeof action === "function" ? (action as (value: T) => T)(current) : action;
}

test("sync state runner resolves schema diff target away from active connection", () => {
  let target = "conn-1";

  const changed = runResolveSchemaDiffTarget({
    activeConnectionId: "conn-1",
    connections: [{ id: "conn-1" }, { id: "conn-2" }],
    setSchemaDiffTargetConnectionId: (action) => {
      target = applyState(target, action);
    },
  });

  assert.equal(changed, true);
  assert.equal(target, "conn-2");
});

test("sync state runner resets schema diff state for connection and target changes", () => {
  const events: string[] = [];

  runResetSchemaDiffForConnection({
    resetState: () => events.push("reset"),
    finishCompare: () => events.push("finish"),
  });
  runResetSchemaDiffForTarget({
    resetState: () => events.push("reset"),
  });

  assert.deepEqual(events, ["reset", "finish", "reset"]);
});

test("sync state runner repairs data sync source and target ids", () => {
  const changes: string[] = [];

  const changed = runResolveDataSyncConnections({
    activeConnectionId: "conn-1",
    currentSourceConnectionId: "missing",
    currentTargetConnectionId: "conn-1",
    connections: [{ id: "conn-1" }, { id: "conn-2" }],
    setSyncSourceConnectionId: (connectionId) => changes.push(`source:${connectionId}`),
    setSyncTargetConnectionId: (connectionId) => changes.push(`target:${connectionId}`),
  });

  assert.equal(changed, true);
  assert.deepEqual(changes, ["source:conn-1", "target:conn-2"]);
});

test("sync state runner creates reusable connection state action objects", () => {
  const changes: string[] = [];
  const actions = createSyncConnectionStateActions({
    setSyncSourceConnectionId: (connectionId) => changes.push(`source:${connectionId}`),
    setSyncTargetConnectionId: (connectionId) => changes.push(`target:${connectionId}`),
  });

  actions.setSourceConnectionId("conn-source");
  actions.setTargetConnectionId("conn-target");

  assert.deepEqual(changes, ["source:conn-source", "target:conn-target"]);
});

test("sync state runner reconciles selected tables and prunes stale configs together", () => {
  let selectedTables = ["missing"];
  let configs: Record<string, SyncTableConfigDraft> = {
    users: {
      keyColumnsText: "id",
      compareColumnsText: "name",
      whereClause: "",
    },
    missing: {
      keyColumnsText: "id",
      compareColumnsText: "name",
      whereClause: "",
    },
  };

  runReconcileDataSyncTables({
    availableTableNames: ["orders", "users"],
    selectedTableName: "users",
    setSyncSelectedTables: (action) => {
      selectedTables = applyState(selectedTables, action);
    },
    setSyncTableConfigs: (action) => {
      configs = applyState(configs, action);
    },
  });

  assert.deepEqual(selectedTables, ["users"]);
  assert.deepEqual(Object.keys(configs), ["users"]);
});

test("sync state runner clears stale data diff and apply artifacts", () => {
  const events: string[] = [];

  runClearDataSyncArtifacts({
    clearArtifacts: () => events.push("clear-artifacts"),
  });

  assert.deepEqual(events, ["clear-artifacts"]);
});
