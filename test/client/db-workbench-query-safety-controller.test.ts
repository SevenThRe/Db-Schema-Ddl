import test from "node:test";
import assert from "node:assert/strict";

import type { DangerousSqlPreview } from "../../shared/schema.ts";
import type { QuerySafetyStateActions } from "../../client/src/components/extensions/db-workbench/query-safety-runner.ts";
import {
  createWorkbenchQuerySafetyController,
} from "../../client/src/components/extensions/db-workbench/workbench-query-safety-controller.ts";

function createActions(events: string[]): QuerySafetyStateActions {
  return {
    setPendingSql: (sql) => events.push(`pendingSql:${sql ?? "clear"}`),
    setPendingCursorOffset: (cursorOffset) =>
      events.push(`cursor:${cursorOffset ?? "clear"}`),
    setPendingQuerySource: (source) => events.push(`source:${source ? source.kind : "clear"}`),
    setPendingQueryMode: (mode) => events.push(`mode:${mode}`),
    setShowDangerDialog: (open) => events.push(`dangerOpen:${open}`),
    clearDangerPreview: () => events.push("dangerPreview:clear"),
    clearQueryError: () => events.push("queryError:clear"),
    setDangerPreview: (preview: DangerousSqlPreview) =>
      events.push(`dangerPreview:${preview.dangers.length}`),
    applyParameterReview: (review) =>
      events.push(`parameterReview:${review.parameters.length}`),
    applyParameterValues: (values) =>
      events.push(`parameterValues:${Object.keys(values).length}`),
    clearParameterReview: () => events.push("parameterReview:clear"),
    clearParameterValues: () => events.push("parameterValues:clear"),
    applyScriptReview: (review) =>
      events.push(`scriptReview:${review.statements.length}`),
    clearScriptReview: () => events.push("scriptReview:clear"),
  };
}

test("workbench query safety controller centralizes parameter, danger, and script flows", async () => {
  const events: string[] = [];
  let parameterValues: Record<string, { rawValue: string }> = {};
  const actions = createActions(events);

  const controller = createWorkbenchQuerySafetyController({
    isExecuting: false,
    isExporting: false,
    pendingSql: "delete from users",
    pendingCursorOffset: 2,
    pendingQuerySource: null,
    pendingQueryMode: "statement",
    pendingParameterReview: {
      sql: "select * from users where id = :id",
      source: null,
      cursorOffset: 10,
      parameters: [
        {
          name: "id",
          occurrences: [{ name: "id", start: 31, end: 34, syntax: "colon" }],
        },
      ],
      mode: "statement",
    },
    parameterValues: { id: { rawValue: "42" } },
    pendingScriptReview: {
      sql: "select 1; select 2;",
      statements: [],
    },
    actions,
    setParameterValues: (updater) => {
      parameterValues = typeof updater === "function" ? updater(parameterValues) : updater;
      events.push(`setParameterValues:${Object.keys(parameterValues).length}`);
    },
    previewAndExecuteSql: async (sql, source, mode, cursorOffset) => {
      events.push(`preview:${sql}:${mode}:${cursorOffset ?? "none"}`);
      return null;
    },
    executeImmediate: async (sql, confirmed, source, mode, cursorOffset) => {
      events.push(`execute:${sql}:${confirmed}:${mode}:${cursorOffset ?? "none"}`);
      return null;
    },
  });

  controller.handleParameterValueChange("id", "7");
  assert.equal(parameterValues.id?.rawValue, "7");

  await controller.handleExecute("select * from users where id = :id");
  assert.ok(events.includes("parameterReview:1"));
  assert.ok(events.includes("parameterValues:1"));

  await controller.handleConfirmParameterReview();
  assert.ok(events.some((event) => event.startsWith("preview:select * from users where id = 42")));

  await controller.handleDangerConfirm();
  assert.ok(events.includes("execute:delete from users:true:statement:2"));

  controller.handleDangerCancel();
  assert.ok(events.includes("dangerOpen:false"));

  await controller.handleExecuteScript("select 1; select 2;");
  assert.ok(events.includes("scriptReview:2"));

  await controller.handleExecuteSelection("select 1", 1);
  assert.ok(events.includes("preview:select 1:statement:1"));
});
