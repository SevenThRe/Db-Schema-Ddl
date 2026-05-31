import test from "node:test";
import assert from "node:assert/strict";
import type { DbObjectInspectionResponse } from "../../shared/schema";
import {
  buildInspectionTargetForSession,
  buildObjectInspectionRequest,
  createEmptyObjectInspectionState,
  createObjectInspectionFailureState,
  createObjectInspectionSuccessState,
  tableNameFromInspection,
} from "../../client/src/components/extensions/db-workbench/object-inspection-runtime";

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

test("object inspection runtime builds backend request payload", () => {
  assert.deepEqual(
    buildObjectInspectionRequest({
      connectionId: "conn-1",
      runtimeSchema: "public",
      objectKind: "function",
      objectName: "calculate_total",
      signature: "calculate_total(integer)",
      parentObjectName: null,
    }),
    {
      connectionId: "conn-1",
      schema: "public",
      objectKind: "function",
      objectName: "calculate_total",
      signature: "calculate_total(integer)",
      parentObjectName: undefined,
    },
  );
});

test("object inspection runtime centralizes empty success and failure states", () => {
  assert.deepEqual(createEmptyObjectInspectionState("Pick an object."), {
    inspection: null,
    error: "Pick an object.",
  });

  const response = inspection();
  assert.deepEqual(createObjectInspectionSuccessState(response), {
    inspection: response,
    error: null,
  });

  assert.deepEqual(createObjectInspectionFailureState(new Error("missing table")), {
    state: {
      inspection: null,
      error: "missing table",
    },
    notice: {
      title: "Object inspection failed",
      description: "missing table",
      variant: "destructive",
    },
  });
});

test("object inspection runtime derives selected table and session targets", () => {
  assert.equal(tableNameFromInspection(inspection()), "users");
  assert.equal(
    tableNameFromInspection(inspection({ objectKind: "view", objectName: "active_users" })),
    null,
  );

  assert.deepEqual(buildInspectionTargetForSession(inspection(), null), {
    objectKind: "table",
    objectName: "users",
    signature: null,
    parentObjectName: null,
  });

  assert.deepEqual(
    buildInspectionTargetForSession(null, {
      objectKind: "trigger",
      objectName: "audit_users",
      signature: null,
      parentObjectName: "users",
    }),
    {
      objectKind: "trigger",
      objectName: "audit_users",
      signature: null,
      parentObjectName: "users",
    },
  );
});
