import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbObjectInspectionRequest,
  DbObjectInspectionResponse,
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "../../shared/schema";
import {
  createWorkbenchInspectionDiffController,
} from "../../client/src/components/extensions/db-workbench/workbench-inspection-diff-controller";
import type { ObjectInspectionWorkspaceState } from "../../client/src/components/extensions/db-workbench/object-inspection-runtime";
import type { SchemaDiffWorkspaceState } from "../../client/src/components/extensions/db-workbench/schema-diff-runtime";

function inspection(objectName = "users"): DbObjectInspectionResponse {
  return {
    connectionId: "conn-1",
    database: "app",
    schema: "public",
    objectKind: "table",
    objectName,
    displayName: `public.${objectName}`,
    supported: true,
    columns: [],
    indexes: [],
    foreignKeys: [],
    coverageNotes: [],
  };
}

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

test("workbench inspection diff controller centralizes object inspection, restore, and schema compare", async () => {
  const events: string[] = [];
  const inspectionRequests: DbObjectInspectionRequest[] = [];
  const introspected: string[] = [];
  const diffed: string[] = [];

  const controller = createWorkbenchInspectionDiffController({
    connectionId: "conn-1",
    runtimeSchema: "public",
    restoredInspectionTarget: {
      objectKind: "table",
      objectName: "orders",
      signature: null,
      parentObjectName: null,
    },
    schemaDiffTargetConnectionId: "conn-2",
    objectInspectionActions: {
      setResultTab: () => events.push("inspect:tab"),
      beginInspection: () => events.push("inspect:begin"),
      applyState: (state: ObjectInspectionWorkspaceState) =>
        events.push(
          state.inspection ? `inspect:state:${state.inspection.objectName}` : "inspect:state:empty",
        ),
      resetState: () => events.push("inspect:reset"),
      selectTable: (tableName) => events.push(`inspect:select:${tableName}`),
      clearRestoredInspectionTarget: () => events.push("inspect:clear-restored"),
      finishInspection: () => events.push("inspect:finish"),
    },
    schemaDiffActions: {
      setResultTab: () => events.push("diff:tab"),
      setTargetConnectionId: (connectionId) => events.push(`diff:target:${connectionId}`),
      applyTargetConnectionId: () => undefined,
      beginCompare: () => events.push("diff:begin"),
      applyState: (state: SchemaDiffWorkspaceState) =>
        events.push(state.result ? `diff:state:${state.result.addedTables}` : "diff:state:empty"),
      resetState: () => events.push("diff:reset"),
      finishCompare: () => events.push("diff:finish"),
    },
    inspectObject: async (request) => {
      inspectionRequests.push(request);
      return inspection(request.objectName);
    },
    introspect: async (connectionId) => {
      introspected.push(connectionId);
      return snapshot(connectionId);
    },
    diff: async (sourceConnectionId, targetConnectionId) => {
      diffed.push(`${sourceConnectionId}->${targetConnectionId}`);
      return diffResult();
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  const inspected = await controller.handleInspectObject("table", "users");
  const restored = await controller.handleRestoreInspectionTarget();
  await controller.handlePreviewSchemaDiff();

  assert.equal(inspected?.objectName, "users");
  assert.equal(restored, true);
  assert.deepEqual(
    inspectionRequests.map((request) => request.objectName),
    ["users", "orders"],
  );
  assert.deepEqual(introspected, ["conn-1", "conn-2"]);
  assert.deepEqual(diffed, ["conn-1->conn-2"]);
  assert.ok(events.includes("inspect:select:users"));
  assert.ok(events.includes("inspect:select:orders"));
  assert.ok(events.includes("inspect:clear-restored"));
  assert.ok(events.includes("diff:state:1"));
});
