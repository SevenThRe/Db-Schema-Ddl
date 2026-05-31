import test from "node:test";
import assert from "node:assert/strict";
import type { DbObjectInspectionResponse } from "../../shared/schema";
import type { WorkbenchInspectionTarget } from "../../client/src/components/extensions/db-workbench/workbench-session";
import {
  runResetObjectInspectionForContext,
  runRestoredObjectInspectionTarget,
} from "../../client/src/components/extensions/db-workbench/object-inspection-session-runner";

function inspection(): DbObjectInspectionResponse {
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
  };
}

test("object inspection session runner skips when no restored target exists", async () => {
  const restored = await runRestoredObjectInspectionTarget({
    restoredInspectionTarget: null,
    inspectObject: async () => assert.fail("missing target should not inspect"),
    clearRestoredInspectionTarget: () =>
      assert.fail("missing target should not clear"),
  });

  assert.equal(restored, false);
});

test("object inspection session runner restores object inspection target once", async () => {
  const calls: unknown[] = [];
  let cleared = false;
  const target: WorkbenchInspectionTarget = {
    objectKind: "routine",
    objectName: "refresh_summary",
    signature: "refresh_summary()",
    parentObjectName: null,
  };

  const restored = await runRestoredObjectInspectionTarget({
    restoredInspectionTarget: target,
    inspectObject: async (objectKind, objectName, options) => {
      calls.push({ objectKind, objectName, options });
      return inspection();
    },
    clearRestoredInspectionTarget: () => {
      cleared = true;
    },
  });

  assert.equal(restored, true);
  assert.deepEqual(calls, [
    {
      objectKind: "routine",
      objectName: "refresh_summary",
      options: {
        signature: "refresh_summary()",
        parentObjectName: null,
      },
    },
  ]);
  assert.equal(cleared, true);
});

test("object inspection session runner resets inspection state for context changes", () => {
  const events: string[] = [];

  runResetObjectInspectionForContext({
    resetState: () => events.push("reset"),
  });

  assert.deepEqual(events, ["reset"]);
});
