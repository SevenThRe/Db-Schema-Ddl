import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "../../shared/schema";
import {
  createSchemaDiffStateActions,
  runSchemaDiffPreview,
} from "../../client/src/components/extensions/db-workbench/schema-diff-runner";

function snapshot(connectionId: string): DbSchemaSnapshot {
  return {
    connectionId,
    capturedAt: "2026-05-31T00:00:00.000Z",
    driver: "postgres",
    database: "app",
    schema: "public",
    tables: [],
  };
}

function diffResult(): DbSchemaDiffResult {
  return {
    sourceLabel: "source",
    targetLabel: "target",
    addedTables: 1,
    removedTables: 0,
    modifiedTables: 0,
    unchangedTables: 2,
    tableDiffs: [],
  };
}

test("schema diff runner blocks missing target before backend calls", async () => {
  const events: string[] = [];

  const result = await runSchemaDiffPreview({
    sourceConnectionId: "conn-a",
    targetConnectionId: "",
    introspect: async () => assert.fail("introspect should not run"),
    diff: async () => assert.fail("diff should not run"),
    setResultTab: () => assert.fail("setResultTab should not run"),
    beginCompare: () => assert.fail("beginCompare should not run"),
    applyState: (state) => events.push(`state:${state.issue ?? "none"}`),
    showNotification: () => assert.fail("showNotification should not run"),
    finishCompare: () => assert.fail("finishCompare should not run"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "state:Select a target connection before compare.",
  ]);
});

test("schema diff runner compares source and target snapshots", async () => {
  const events: string[] = [];
  const introspected: string[] = [];
  const diffed: string[] = [];

  const result = await runSchemaDiffPreview({
    sourceConnectionId: "conn-a",
    targetConnectionId: "conn-b",
    introspect: async (connectionId) => {
      introspected.push(connectionId);
      return snapshot(connectionId);
    },
    diff: async (sourceConnectionId, targetConnectionId) => {
      diffed.push(`${sourceConnectionId}->${targetConnectionId}`);
      return diffResult();
    },
    setResultTab: () => events.push("tab"),
    beginCompare: () => events.push("begin"),
    applyState: (state) => {
      events.push(state.result ? `state:${state.result.addedTables}` : "state:empty");
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishCompare: () => events.push("finish"),
  });

  assert.equal(result?.sourceSnapshot.connectionId, "conn-a");
  assert.equal(result?.targetSnapshot.connectionId, "conn-b");
  assert.deepEqual(introspected, ["conn-a", "conn-b"]);
  assert.deepEqual(diffed, ["conn-a->conn-b"]);
  assert.deepEqual(events, [
    "begin",
    "state:empty",
    "tab",
    "state:1",
    "finish",
  ]);
});

test("schema diff runner creates reusable state action objects", () => {
  const events: string[] = [];
  let targetConnectionId = "conn-a";
  const actions = createSchemaDiffStateActions({
    setResultTab: () => events.push("tab:schema-diff"),
    setSchemaDiffTargetConnectionId: (action) => {
      targetConnectionId =
        typeof action === "function" ? action(targetConnectionId) : action;
      events.push(`target:${targetConnectionId}`);
    },
    setIsSchemaDiffing: (isDiffing) => events.push(`diffing:${isDiffing}`),
    setSchemaDiffState: (state) =>
      events.push(state.result ? `state:${state.result.addedTables}` : `state:${state.issue ?? "empty"}`),
  });

  actions.setResultTab();
  actions.setTargetConnectionId("conn-b");
  actions.applyTargetConnectionId((current) => `${current}-resolved`);
  actions.beginCompare();
  actions.applyState({
    sourceSnapshot: null,
    targetSnapshot: null,
    result: null,
    issue: null,
  });
  actions.applyState({
    sourceSnapshot: snapshot("conn-a"),
    targetSnapshot: snapshot("conn-b"),
    result: diffResult(),
    issue: null,
  });
  actions.resetState();
  actions.finishCompare();

  assert.deepEqual(events, [
    "tab:schema-diff",
    "target:conn-b",
    "target:conn-b-resolved",
    "diffing:true",
    "state:empty",
    "state:1",
    "state:empty",
    "diffing:false",
  ]);
});

test("schema diff runner applies failure state and notification", async () => {
  const events: string[] = [];

  const result = await runSchemaDiffPreview({
    sourceConnectionId: "conn-a",
    targetConnectionId: "conn-b",
    introspect: async () => {
      throw new Error("Error invoking introspect: target offline");
    },
    diff: async () => diffResult(),
    setResultTab: () => events.push("tab"),
    beginCompare: () => events.push("begin"),
    applyState: (state) => events.push(`state:${state.issue ?? "none"}`),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.description}`),
    finishCompare: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "begin",
    "state:none",
    "tab",
    "state:target offline",
    "notice:Schema compare failed:target offline",
    "finish",
  ]);
});
