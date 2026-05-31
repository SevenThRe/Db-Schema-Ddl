import test from "node:test";
import assert from "node:assert/strict";

import {
  createDataSyncDraftActions,
  runChangeSyncRowAction,
  runSyncTableConfigChange,
  runToggleIncludeUnchangedRows,
  runToggleSyncTable,
} from "../../client/src/components/extensions/db-workbench/data-sync-draft-runner";
import type { DataSyncRowDiffEntry } from "../../client/src/components/extensions/db-workbench/data-sync-row-diff";
import type { SyncTableConfigDraft } from "../../client/src/components/extensions/db-workbench/data-sync-utils";

function row(tableName: string, id: number): DataSyncRowDiffEntry {
  return {
    tableName,
    rowKey: { id },
    status: "value_changed",
    suggestedAction: "update",
  };
}

test("data sync draft runner updates one table config while preserving defaults", () => {
  let configs: Record<string, SyncTableConfigDraft> = {};

  runSyncTableConfigChange(
    {
      updateTableConfigs: (updater) => {
        configs = updater(configs);
      },
    },
    "users",
    "whereClause",
    "updated_at >= current_date",
  );
  runSyncTableConfigChange(
    {
      updateTableConfigs: (updater) => {
        configs = updater(configs);
      },
    },
    "users",
    "keyColumnsText",
    "id",
  );

  assert.deepEqual(configs.users, {
    keyColumnsText: "id",
    compareColumnsText: "",
    whereClause: "updated_at >= current_date",
  });
});

test("data sync draft runner toggles tables and keeps at least one selected", () => {
  let selectedTables = ["users"];
  const actions = {
    updateSelectedTables: (updater: (previous: string[]) => string[]) => {
      selectedTables = updater(selectedTables);
    },
  };

  runToggleSyncTable(actions, "users");
  assert.deepEqual(selectedTables, ["users"]);

  runToggleSyncTable(actions, "orders");
  assert.deepEqual(selectedTables, ["users", "orders"]);

  runToggleSyncTable(actions, "users");
  assert.deepEqual(selectedTables, ["orders"]);
});

test("data sync draft runner changes row action and clears stale apply artifacts", () => {
  let rows = [row("users", 1), row("users", 2)];
  let cleared = 0;

  runChangeSyncRowAction(
    {
      updateRows: (updater) => {
        rows = updater(rows);
      },
      clearApplyArtifacts: () => {
        cleared += 1;
      },
    },
    1,
    "ignore",
  );

  assert.equal(rows[0].suggestedAction, "update");
  assert.equal(rows[1].suggestedAction, "ignore");
  assert.equal(cleared, 1);
});

test("data sync draft runner toggles unchanged rows and reloads current detail", () => {
  let includeUnchanged = false;
  const loads: string[] = [];

  runToggleIncludeUnchangedRows({
    actions: {
      setIncludeUnchanged: (nextValue) => {
        includeUnchanged = nextValue;
      },
    },
    nextIncludeUnchanged: true,
    currentDetailTableName: "users",
    loadDetail: async (tableName, nextValue) => {
      loads.push(`${tableName}:${nextValue}`);
    },
  });

  assert.equal(includeUnchanged, true);
  assert.deepEqual(loads, ["users:true"]);
});

test("data sync draft runner toggles unchanged rows without detail reload when no detail exists", () => {
  let includeUnchanged = true;
  const loads: string[] = [];

  runToggleIncludeUnchangedRows({
    actions: {
      setIncludeUnchanged: (nextValue) => {
        includeUnchanged = nextValue;
      },
    },
    nextIncludeUnchanged: false,
    currentDetailTableName: null,
    loadDetail: async (tableName, nextValue) => {
      loads.push(`${tableName}:${nextValue}`);
    },
  });

  assert.equal(includeUnchanged, false);
  assert.deepEqual(loads, []);
});

test("data sync draft runner creates reusable draft state action objects", () => {
  const events: string[] = [];
  let selectedTables = ["users"];
  let configs: Record<string, SyncTableConfigDraft> = {};
  let rows = [row("users", 1)];
  let includeUnchanged = false;
  const actions = createDataSyncDraftActions({
    updateSelectedTables: (updater) => {
      selectedTables = updater(selectedTables);
      events.push(`tables:${selectedTables.join(",")}`);
    },
    updateTableConfigs: (updater) => {
      configs = updater(configs);
      events.push(`config:${configs.users?.keyColumnsText ?? ""}`);
    },
    updateRows: (updater) => {
      rows = updater(rows);
      events.push(`rows:${rows[0]?.suggestedAction ?? "none"}`);
    },
    setIncludeUnchanged: (nextValue) => {
      includeUnchanged = nextValue;
      events.push(`include:${includeUnchanged}`);
    },
    setApplyPreview: (preview) => events.push(`preview:${preview ? "set" : "none"}`),
    setApplyExecute: (execute) => events.push(`execute:${execute ? "set" : "none"}`),
  });

  runSyncTableConfigChange(actions, "users", "keyColumnsText", "id");
  runToggleSyncTable(actions, "orders");
  runChangeSyncRowAction(actions, 0, "ignore");
  runToggleIncludeUnchangedRows({
    actions,
    nextIncludeUnchanged: true,
    currentDetailTableName: null,
    loadDetail: async () => assert.fail("detail should not load"),
  });

  assert.equal(configs.users?.keyColumnsText, "id");
  assert.deepEqual(selectedTables, ["users", "orders"]);
  assert.equal(rows[0]?.suggestedAction, "ignore");
  assert.equal(includeUnchanged, true);
  assert.deepEqual(events, [
    "config:id",
    "tables:users,orders",
    "rows:ignore",
    "preview:none",
    "execute:none",
    "include:true",
  ]);
});
