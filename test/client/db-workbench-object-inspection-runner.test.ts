import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbObjectInspectionRequest,
  DbObjectInspectionResponse,
} from "../../shared/schema";
import {
  createObjectInspectionStateActions,
  runObjectInspection,
} from "../../client/src/components/extensions/db-workbench/object-inspection-runner";

function inspection(
  overrides: Partial<DbObjectInspectionResponse> = {},
): DbObjectInspectionResponse {
  return {
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
    ...overrides,
  };
}

test("object inspection runner builds request, applies state, and selects inspected tables", async () => {
  const requests: DbObjectInspectionRequest[] = [];
  const events: string[] = [];

  const result = await runObjectInspection({
    connectionId: "conn-1",
    runtimeSchema: "public",
    objectKind: "table",
    objectName: "users",
    signature: null,
    parentObjectName: null,
    inspectObject: async (request) => {
      requests.push(request);
      events.push("inspect");
      return inspection();
    },
    setResultTab: () => events.push("tab"),
    beginInspection: () => events.push("begin"),
    applyState: (state) => {
      events.push(state.inspection ? `state:${state.inspection.objectName}` : "state:empty");
    },
    selectTable: (tableName) => events.push(`select:${tableName}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    finishInspection: () => events.push("finish"),
  });

  assert.equal(result?.objectName, "users");
  assert.deepEqual(requests, [
    {
      connectionId: "conn-1",
      schema: "public",
      objectKind: "table",
      objectName: "users",
      signature: undefined,
      parentObjectName: undefined,
    },
  ]);
  assert.deepEqual(events, [
    "tab",
    "begin",
    "state:empty",
    "inspect",
    "state:users",
    "select:users",
    "finish",
  ]);
});

test("object inspection runner preserves routine metadata and does not select non-table objects", async () => {
  const selectedTables: string[] = [];
  const requests: DbObjectInspectionRequest[] = [];

  const result = await runObjectInspection({
    connectionId: "conn-1",
    runtimeSchema: null,
    objectKind: "function",
    objectName: "calculate_total",
    signature: "calculate_total(integer)",
    parentObjectName: "orders",
    inspectObject: async (request) => {
      requests.push(request);
      return inspection({
        objectKind: "function",
        objectName: "calculate_total",
        signature: "calculate_total(integer)",
        parentObjectName: "orders",
      });
    },
    setResultTab: () => undefined,
    beginInspection: () => undefined,
    applyState: () => undefined,
    selectTable: (tableName) => selectedTables.push(tableName),
    showNotification: () => undefined,
    finishInspection: () => undefined,
  });

  assert.equal(result?.objectKind, "function");
  assert.deepEqual(requests, [
    {
      connectionId: "conn-1",
      schema: undefined,
      objectKind: "function",
      objectName: "calculate_total",
      signature: "calculate_total(integer)",
      parentObjectName: "orders",
    },
  ]);
  assert.deepEqual(selectedTables, []);
});

test("object inspection runner creates reusable state action objects", () => {
  const events: string[] = [];
  const actions = createObjectInspectionStateActions({
    setResultTab: () => events.push("tab:inspect"),
    setIsInspectingObject: (isInspecting) => events.push(`inspecting:${isInspecting}`),
    setInspectionState: (state) =>
      events.push(state.inspection ? `state:${state.inspection.objectName}` : `state:${state.error ?? "empty"}`),
    setSelectedTableName: (tableName) => events.push(`select:${tableName}`),
    setRestoredInspectionTarget: (target) => events.push(`restored:${target ? "set" : "none"}`),
  });

  actions.setResultTab();
  actions.beginInspection();
  actions.applyState({ inspection: null, error: null });
  actions.applyState({ inspection: inspection(), error: null });
  actions.resetState();
  actions.selectTable("users");
  actions.clearRestoredInspectionTarget();
  actions.finishInspection();

  assert.deepEqual(events, [
    "tab:inspect",
    "inspecting:true",
    "state:empty",
    "state:users",
    "state:empty",
    "select:users",
    "restored:none",
    "inspecting:false",
  ]);
});

test("object inspection runner applies failure state and notification", async () => {
  const events: string[] = [];

  const result = await runObjectInspection({
    connectionId: "conn-1",
    runtimeSchema: "public",
    objectKind: "table",
    objectName: "missing_table",
    inspectObject: async () => {
      throw new Error("Error invoking inspect: missing table");
    },
    setResultTab: () => events.push("tab"),
    beginInspection: () => events.push("begin"),
    applyState: (state) => events.push(`state:${state.error ?? "ok"}`),
    selectTable: () => assert.fail("selectTable should not run"),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.description}`),
    finishInspection: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "tab",
    "begin",
    "state:ok",
    "state:missing table",
    "notice:Object inspection failed:missing table",
    "finish",
  ]);
});
