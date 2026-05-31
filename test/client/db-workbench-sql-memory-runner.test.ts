import test from "node:test";
import assert from "node:assert/strict";

import {
  createSqlMemoryStateActions,
  runAcceptedSqlSuggestion,
  runClearAllSqlMemory,
  runClearCurrentSchemaSqlMemory,
  runClearSqlMemoryCategory,
  runSqlMemoryRetentionChange,
} from "../../client/src/components/extensions/db-workbench/sql-memory-runner";
import {
  createEmptySqlWorkbenchMemory,
  type SqlMemoryClearOptions,
  type SqlMemoryRetentionSettings,
  type SqlWorkbenchMemoryState,
} from "../../client/src/components/extensions/db-workbench/sql-memory";

function memory(label = "base"): SqlWorkbenchMemoryState {
  return {
    ...createEmptySqlWorkbenchMemory(),
    acceptedSuggestions: [
      {
        key: label,
        label,
        kind: "table",
        schema: "public",
        relation: label,
        column: null,
        count: 1,
        lastAcceptedAt: "2026-05-31T00:00:00.000Z",
      },
    ],
  };
}

test("sql memory runner records accepted suggestions through the connection session", () => {
  const applied: SqlWorkbenchMemoryState[] = [];
  const updated = memory("users");

  const result = runAcceptedSqlSuggestion({
    connectionId: "conn-1",
    suggestion: {
      label: "users",
      kind: "table",
      schema: "public",
      relation: "users",
    },
    recordAcceptedSuggestion: (connectionId, suggestion) => {
      assert.equal(connectionId, "conn-1");
      assert.equal(suggestion.label, "users");
      return { sqlMemory: updated };
    },
    applyMemory: (next) => applied.push(next),
  });

  assert.equal(result, updated);
  assert.deepEqual(applied, [updated]);
});

test("sql memory runner updates retention settings and notifies the operator", () => {
  const notices: string[] = [];
  const applied: SqlWorkbenchMemoryState[] = [];
  const updated = memory("retention");
  const requests: Array<Partial<SqlMemoryRetentionSettings>> = [];

  const result = runSqlMemoryRetentionChange({
    connectionId: "conn-1",
    key: "trackQueryPatterns",
    checked: false,
    updateRetention: (connectionId, settings) => {
      assert.equal(connectionId, "conn-1");
      requests.push(settings);
      return { sqlMemory: updated };
    },
    applyMemory: (next) => applied.push(next),
    showNotification: (notice) => notices.push(`${notice.title}:${notice.description}`),
  });

  assert.equal(result, updated);
  assert.deepEqual(requests, [{ trackQueryPatterns: false }]);
  assert.deepEqual(applied, [updated]);
  assert.deepEqual(notices, [
    "SQL memory updated:trackQueryPatterns is now paused for this connection.",
  ]);
});

test("sql memory runner clears one category with explicit session options", () => {
  const options: SqlMemoryClearOptions[] = [];
  const notices: string[] = [];
  const updated = memory("cleared");

  const result = runClearSqlMemoryCategory({
    connectionId: "conn-1",
    category: "valueProfiles",
    clearMemory: (connectionId, clearOptions) => {
      assert.equal(connectionId, "conn-1");
      options.push(clearOptions ?? {});
      return { sqlMemory: updated };
    },
    applyMemory: () => undefined,
    showNotification: (notice) => notices.push(notice.description),
  });

  assert.equal(result, updated);
  assert.deepEqual(options, [{ categories: ["valueProfiles"] }]);
  assert.deepEqual(notices, ["valueProfiles were cleared for this connection."]);
});

test("sql memory runner blocks current schema clear when schema scope is unavailable", () => {
  const notices: string[] = [];

  const result = runClearCurrentSchemaSqlMemory({
    connectionId: "conn-1",
    runtimeSchema: "   ",
    clearMemory: () => assert.fail("clearMemory should not run"),
    applyMemory: () => assert.fail("memory should not apply"),
    showNotification: (notice) => notices.push(notice.title),
  });

  assert.equal(result, null);
  assert.deepEqual(notices, ["Schema scope unavailable"]);
});

test("sql memory runner clears current schema and all memory with operator notices", () => {
  const options: Array<SqlMemoryClearOptions | undefined> = [];
  const notices: string[] = [];
  const schemaMemory = memory("schema");
  const allMemory = memory("all");

  const scopedResult = runClearCurrentSchemaSqlMemory({
    connectionId: "conn-1",
    runtimeSchema: " public ",
    clearMemory: (_connectionId, clearOptions) => {
      options.push(clearOptions);
      return { sqlMemory: schemaMemory };
    },
    applyMemory: () => undefined,
    showNotification: (notice) => notices.push(notice.description),
  });
  const allResult = runClearAllSqlMemory({
    connectionId: "conn-1",
    clearMemory: (connectionId) => {
      assert.equal(connectionId, "conn-1");
      options.push(undefined);
      return { sqlMemory: allMemory };
    },
    applyMemory: () => undefined,
    showNotification: (notice) => notices.push(notice.description),
  });

  assert.equal(scopedResult, schemaMemory);
  assert.equal(allResult, allMemory);
  assert.deepEqual(options, [{ schema: "public" }, undefined]);
  assert.deepEqual(notices, [
    "Entries scoped to public were removed.",
    "All adaptive ranking memory for this connection was removed.",
  ]);
});

test("sql memory runner creates reusable state action objects", () => {
  const applied: string[] = [];
  const dialogEvents: boolean[] = [];
  const actions = createSqlMemoryStateActions({
    setSqlMemory: (nextMemory) => {
      applied.push(nextMemory.acceptedSuggestions[0]?.label ?? "empty");
    },
    setDialogOpen: (open) => {
      dialogEvents.push(open);
    },
  });

  actions.openDialog();
  actions.applyMemory(memory("users"));
  actions.closeDialog();

  assert.deepEqual(applied, ["users"]);
  assert.deepEqual(dialogEvents, [true, false]);
});
