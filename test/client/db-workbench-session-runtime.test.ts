import test from "node:test";
import assert from "node:assert/strict";
import type { DbObjectInspectionResponse } from "../../shared/schema";
import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";
import {
  buildWorkbenchSessionPersistenceState,
  repairActiveQueryTabs,
  resolveRestoredActiveSchema,
} from "../../client/src/components/extensions/db-workbench/workbench-session-runtime";
import { createEmptySqlWorkbenchMemory } from "../../client/src/components/extensions/db-workbench/sql-memory";

function tab(id: string): QueryTab {
  return {
    id,
    label: id,
    sql: `select '${id}'`,
    connectionId: "old",
  };
}

const inspection: DbObjectInspectionResponse = {
  connectionId: "conn-1",
  database: "app",
  schema: "public",
  objectKind: "table",
  objectName: "users",
  displayName: "public.users",
  supported: true,
  columns: [],
  indexes: [],
  foreignKeys: [],
  coverageNotes: [],
};

test("session runtime resolves restored active schema by driver", () => {
  assert.equal(
    resolveRestoredActiveSchema({
      driver: "postgres",
      restoredActiveSchema: "audit",
      defaultSchema: "public",
    }),
    "audit",
  );
  assert.equal(
    resolveRestoredActiveSchema({
      driver: "postgres",
      restoredActiveSchema: null,
      defaultSchema: " app ",
    }),
    "app",
  );
  assert.equal(
    resolveRestoredActiveSchema({
      driver: "mysql",
      restoredActiveSchema: "ignored",
      defaultSchema: "ignored",
    }),
    "public",
  );
});

test("session runtime repairs active query tabs without leaking stale active ids", () => {
  const tabs = [tab("a"), tab("b")];

  assert.deepEqual(
    repairActiveQueryTabs({
      tabs,
      activeTabId: "b",
      connectionId: "conn-1",
    }),
    {
      tabs,
      activeTabId: "b",
      changed: false,
    },
  );

  assert.deepEqual(
    repairActiveQueryTabs({
      tabs,
      activeTabId: "missing",
      connectionId: "conn-1",
    }),
    {
      tabs,
      activeTabId: "a",
      changed: true,
    },
  );
});

test("session runtime builds persistence payload with connection-scoped tabs and inspection target", () => {
  const state = buildWorkbenchSessionPersistenceState({
    connectionId: "conn-1",
    driver: "postgres",
    tabs: [tab("a")],
    activeTabId: "a",
    recentQueries: ["select 1"],
    queryHistory: [],
    sqlMemory: createEmptySqlWorkbenchMemory(),
    savedSnippets: [],
    selectedTableName: "users",
    activeSchema: "public",
    resultTab: "inspect",
    objectInspection: inspection,
    restoredInspectionTarget: null,
    schemaDiffTargetConnectionId: "conn-2",
    syncSourceConnectionId: "conn-1",
    syncTargetConnectionId: "conn-2",
    selectedJobId: "job-1",
  });

  assert.equal(state.tabs[0]?.connectionId, "conn-1");
  assert.equal(state.activeSchema, "public");
  assert.deepEqual(state.inspectionTarget, {
    objectKind: "table",
    objectName: "users",
    signature: null,
    parentObjectName: null,
  });
  assert.equal(state.schemaDiffTargetConnectionId, "conn-2");
  assert.equal(state.selectedJobId, "job-1");
});
