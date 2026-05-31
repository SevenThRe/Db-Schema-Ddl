import test from "node:test";
import assert from "node:assert/strict";

import {
  createQuerySafetyStateActions,
  runCancelDangerousSql,
  runCancelParameterReview,
  runCancelScriptReview,
  runConfirmDangerousSql,
  runConfirmParameterReview,
  runConfirmScriptReview,
  runExecuteScriptWithReview,
  runExecuteWithParameterGate,
  runParameterValueChange,
  runPreviewAndExecuteSql,
} from "../../client/src/components/extensions/db-workbench/query-safety-runner";
import type { DangerousSqlPreview, DbGridEditSource } from "../../shared/schema";
import type { QueryRunMode } from "../../client/src/components/extensions/db-workbench/workbench-session";

const source: DbGridEditSource = {
  kind: "starter-select",
  tableName: "users",
  schema: "public",
  queryMode: "select",
};

function preview(dangers: DangerousSqlPreview["dangers"]): DangerousSqlPreview {
  return {
    dangers,
    sql: "delete from users",
    connectionName: "Local dev",
    environment: "dev",
    database: "app",
  };
}

test("query safety runner confirms parameter review with rendered values", async () => {
  const events: string[] = [];

  const result = await runConfirmParameterReview({
    review: {
      sql: "select * from users where id = :id",
      source,
      cursorOffset: 10,
      mode: "statement",
      parameters: [{ name: "id", token: ":id", syntax: "colon", start: 31, end: 34 }],
    },
    parameterValues: { id: { rawValue: "42" } },
    clearReview: () => events.push("clear-review"),
    clearParameterValues: () => events.push("clear-values"),
    previewAndExecuteSql: async (sql, nextSource, mode, cursorOffset) => {
      events.push(`execute:${sql}:${nextSource?.kind}:${mode}:${cursorOffset}`);
    },
  });

  assert.equal(result, true);
  assert.deepEqual(events, [
    "clear-review",
    "clear-values",
    "execute:select * from users where id = 42:starter-select:statement:10",
  ]);
});

test("query safety runner parameter gate skips, opens review, or executes", async () => {
  const events: string[] = [];

  const skipped = await runExecuteWithParameterGate({
    sql: " ",
    source: null,
    mode: "statement",
    isExecuting: false,
    applyParameterReview: () => assert.fail("review should not apply"),
    applyParameterValues: () => assert.fail("values should not apply"),
    previewAndExecuteSql: async () => assert.fail("execute should not run"),
  });
  const reviewed = await runExecuteWithParameterGate({
    sql: "select * from users where id = :id",
    source,
    mode: "statement",
    isExecuting: false,
    applyParameterReview: (review) => events.push(`review:${review.parameters[0]?.name}`),
    applyParameterValues: (values) => events.push(`values:${Object.keys(values).join(",")}`),
    previewAndExecuteSql: async () => assert.fail("execute should not run before review"),
  });
  const executed = await runExecuteWithParameterGate({
    sql: "select * from users",
    source,
    mode: "statement",
    isExecuting: false,
    isExporting: false,
    applyParameterReview: () => assert.fail("review should not apply"),
    applyParameterValues: () => assert.fail("values should not apply"),
    previewAndExecuteSql: async (sql, nextSource, mode) => {
      events.push(`execute:${sql}:${nextSource?.kind}:${mode}`);
    },
  });

  assert.equal(skipped, "skipped");
  assert.equal(reviewed, "parameter-review");
  assert.equal(executed, "executed");
  assert.deepEqual(events, [
    "review:id",
    "values:id",
    "execute:select * from users:starter-select:statement",
  ]);
});

test("query safety runner updates and cancels parameter review state", () => {
  const events: string[] = [];
  let values = {
    id: { rawValue: "1" },
  };

  runParameterValueChange({
    name: "status",
    rawValue: "active",
    setParameterValues: (updater) => {
      values = updater(values);
    },
  });
  runCancelParameterReview({
    clearReview: () => events.push("review:null"),
    clearParameterValues: () => events.push("values:{}"),
  });

  assert.deepEqual(values, {
    id: { rawValue: "1" },
    status: { rawValue: "active" },
  });
  assert.deepEqual(events, ["review:null", "values:{}"]);
});

test("query safety runner creates reusable state action objects", () => {
  const events: string[] = [];
  const actions = createQuerySafetyStateActions({
    setPendingSql: (sql) => events.push(`sql:${sql ?? "null"}`),
    setPendingCursorOffset: (cursorOffset) =>
      events.push(`cursor:${cursorOffset ?? "undefined"}`),
    setPendingQuerySource: (nextSource) =>
      events.push(`source:${nextSource?.kind ?? "null"}`),
    setPendingQueryMode: (mode) => events.push(`mode:${mode}`),
    setQueryError: (message) => events.push(`error:${message ?? "null"}`),
    setDangerPreview: (nextPreview) =>
      events.push(`danger:${nextPreview?.dangers.join(",") ?? "null"}`),
    setShowDangerDialog: (open) => events.push(`dialog:${open}`),
    setPendingParameterReview: (review) =>
      events.push(`parameter:${review?.parameters[0]?.name ?? "null"}`),
    setParameterValues: (nextValues) =>
      events.push(`values:${Object.keys(nextValues).join(",")}`),
    setPendingScriptReview: (review) =>
      events.push(`script:${review?.statements.length ?? "null"}`),
  });

  actions.setPendingSql("select :id");
  actions.setPendingCursorOffset(3);
  actions.setPendingQuerySource(source);
  actions.setPendingQueryMode("script");
  actions.clearQueryError();
  actions.setDangerPreview(preview(["DELETE_WITHOUT_WHERE"]));
  actions.setShowDangerDialog(true);
  actions.clearDangerPreview();
  actions.applyParameterReview({
    sql: "select :id",
    source,
    mode: "statement",
    parameters: [{ name: "id", token: ":id", syntax: "colon", start: 7, end: 10 }],
  });
  actions.applyParameterValues({ id: { rawValue: "1" } });
  actions.clearParameterReview();
  actions.clearParameterValues();
  actions.applyScriptReview({
    sql: "select 1; select 2;",
    statements: [
      { index: 0, sql: "select 1", start: 0, end: 8, kind: "select", summary: "select 1" },
      { index: 1, sql: "select 2", start: 10, end: 18, kind: "select", summary: "select 2" },
    ],
  });
  actions.clearScriptReview();

  assert.deepEqual(events, [
    "sql:select :id",
    "cursor:3",
    "source:starter-select",
    "mode:script",
    "error:null",
    "danger:DELETE_WITHOUT_WHERE",
    "dialog:true",
    "danger:null",
    "parameter:id",
    "values:id",
    "parameter:null",
    "values:",
    "script:2",
    "script:null",
  ]);
});

test("query safety runner cancels script review state", () => {
  const events: string[] = [];

  runCancelScriptReview({
    clearScriptReview: () => events.push("script:null"),
  });

  assert.deepEqual(events, ["script:null"]);
});

test("query safety runner previews dangerous SQL before execution", async () => {
  const events: string[] = [];

  const result = await runPreviewAndExecuteSql({
    sql: "delete from users",
    source,
    mode: "statement",
    cursorOffset: 7,
    isExecuting: false,
    isExporting: false,
    setPendingSql: (sql) => events.push(`sql:${sql ?? "null"}`),
    setPendingCursorOffset: (cursorOffset) =>
      events.push(`cursor:${cursorOffset ?? "undefined"}`),
    setPendingQuerySource: (nextSource) =>
      events.push(`source:${nextSource?.kind ?? "null"}`),
    setPendingQueryMode: (mode) => events.push(`mode:${mode}`),
    clearQueryError: () => events.push("error:null"),
    setDangerPreview: (nextPreview) =>
      events.push(`preview:${nextPreview.dangers.join(",")}`),
    setShowDangerDialog: (open) => events.push(`dialog:${open}`),
    previewDangerousSql: async (sql, cursorOffset) => {
      events.push(`check:${sql}:${cursorOffset}`);
      return preview(["DELETE_WITHOUT_WHERE"]);
    },
    executeImmediate: async () => assert.fail("dangerous sql should wait for review"),
  });

  assert.equal(result, "danger-review");
  assert.deepEqual(events, [
    "sql:delete from users",
    "cursor:7",
    "source:starter-select",
    "mode:statement",
    "error:null",
    "check:delete from users:7",
    "preview:DELETE_WITHOUT_WHERE",
    "dialog:true",
  ]);
});

test("query safety runner executes safe SQL and falls back when preview fails", async () => {
  const safeEvents: string[] = [];
  const fallbackEvents: string[] = [];

  const safe = await runPreviewAndExecuteSql({
    sql: "select * from users",
    source: null,
    mode: "statement",
    isExecuting: false,
    setPendingSql: (sql) => safeEvents.push(`sql:${sql ?? "null"}`),
    setPendingCursorOffset: (cursorOffset) =>
      safeEvents.push(`cursor:${cursorOffset ?? "undefined"}`),
    setPendingQuerySource: (nextSource) =>
      safeEvents.push(`source:${nextSource?.kind ?? "null"}`),
    setPendingQueryMode: (mode) => safeEvents.push(`mode:${mode}`),
    clearQueryError: () => safeEvents.push("error:null"),
    setDangerPreview: () => assert.fail("safe sql should not open preview"),
    setShowDangerDialog: () => assert.fail("safe sql should not open dialog"),
    previewDangerousSql: async () => preview([]),
    executeImmediate: async (sql, confirmed, nextSource, mode, cursorOffset) => {
      safeEvents.push(
        `execute:${sql}:${confirmed}:${nextSource?.kind ?? "null"}:${mode}:${cursorOffset ?? "undefined"}`,
      );
    },
  });
  const fallback = await runPreviewAndExecuteSql({
    sql: "select 1",
    source,
    mode: "statement",
    isExecuting: false,
    setPendingSql: (sql) => fallbackEvents.push(`sql:${sql ?? "null"}`),
    setPendingCursorOffset: (cursorOffset) =>
      fallbackEvents.push(`cursor:${cursorOffset ?? "undefined"}`),
    setPendingQuerySource: (nextSource) =>
      fallbackEvents.push(`source:${nextSource?.kind ?? "null"}`),
    setPendingQueryMode: (mode) => fallbackEvents.push(`mode:${mode}`),
    clearQueryError: () => fallbackEvents.push("error:null"),
    setDangerPreview: () => assert.fail("failed preview should not open preview"),
    setShowDangerDialog: () => assert.fail("failed preview should not open dialog"),
    previewDangerousSql: async () => {
      throw new Error("preview unavailable");
    },
    executeImmediate: async (sql, confirmed, nextSource, mode) => {
      fallbackEvents.push(`execute:${sql}:${confirmed}:${nextSource?.kind}:${mode}`);
    },
  });

  assert.equal(safe, "executed");
  assert.deepEqual(safeEvents, [
    "sql:select * from users",
    "cursor:undefined",
    "source:null",
    "mode:statement",
    "error:null",
    "execute:select * from users:false:null:statement:undefined",
    "sql:null",
    "cursor:undefined",
    "source:null",
    "mode:statement",
  ]);
  assert.equal(fallback, "fallback-executed");
  assert.deepEqual(fallbackEvents, [
    "sql:select 1",
    "cursor:undefined",
    "source:starter-select",
    "mode:statement",
    "error:null",
    "execute:select 1:false:starter-select:statement",
    "sql:null",
    "cursor:undefined",
    "source:null",
    "mode:statement",
  ]);
});

function dangerResetters(events: string[]) {
  return {
    setShowDangerDialog: (open: boolean) => events.push(`dialog:${open}`),
    clearDangerPreview: () => events.push("preview:null"),
    setPendingSql: (sql: string | null) => events.push(`sql:${sql ?? "null"}`),
    setPendingCursorOffset: (cursorOffset: number | undefined) =>
      events.push(`cursor:${cursorOffset ?? "undefined"}`),
    setPendingQuerySource: (nextSource: DbGridEditSource | null) =>
      events.push(`source:${nextSource?.kind ?? "null"}`),
    setPendingQueryMode: (mode: QueryRunMode) => events.push(`mode:${mode}`),
  };
}

test("query safety runner confirms and cancels dangerous SQL reviews", async () => {
  const confirmEvents: string[] = [];
  const cancelEvents: string[] = [];

  const confirmed = await runConfirmDangerousSql({
    review: {
      sql: "delete from users where id = 1",
      source,
      mode: "statement",
      cursorOffset: 5,
    },
    executeImmediate: async (sql, confirmedFlag, nextSource, mode, cursorOffset) => {
      confirmEvents.push(
        `execute:${sql}:${confirmedFlag}:${nextSource?.kind}:${mode}:${cursorOffset}`,
      );
    },
    ...dangerResetters(confirmEvents),
  });
  runCancelDangerousSql(dangerResetters(cancelEvents));

  assert.equal(confirmed, true);
  assert.deepEqual(confirmEvents, [
    "dialog:false",
    "preview:null",
    "execute:delete from users where id = 1:true:starter-select:statement:5",
    "sql:null",
    "cursor:undefined",
    "source:null",
    "mode:statement",
  ]);
  assert.deepEqual(cancelEvents, [
    "dialog:false",
    "preview:null",
    "sql:null",
    "cursor:undefined",
    "source:null",
    "mode:statement",
  ]);
});

test("query safety runner gates multi-statement scripts behind review", async () => {
  const events: string[] = [];

  const skipped = await runExecuteScriptWithReview({
    sql: "select 1",
    isExecuting: true,
    applyScriptReview: () => assert.fail("review should not apply"),
    executeScript: async () => assert.fail("execute should not run"),
  });
  const reviewed = await runExecuteScriptWithReview({
    sql: "select 1; update users set active = false;",
    isExecuting: false,
    applyScriptReview: (review) => events.push(`review:${review.statements.length}`),
    executeScript: async () => assert.fail("execute should wait for review"),
  });
  const executed = await runExecuteScriptWithReview({
    sql: "select 1",
    isExecuting: false,
    applyScriptReview: () => assert.fail("review should not apply"),
    executeScript: async (sql) => events.push(`execute:${sql}`),
  });

  assert.equal(skipped, "skipped");
  assert.equal(reviewed, "script-review");
  assert.equal(executed, "executed");
  assert.deepEqual(events, ["review:2", "execute:select 1"]);
});

test("query safety runner confirms script review through script execution path", async () => {
  const events: string[] = [];

  const result = await runConfirmScriptReview({
    review: {
      sql: "select 1; select 2;",
      statements: [],
    },
    clearScriptReview: () => events.push("clear"),
    executeScript: async (sql) => events.push(`execute:${sql}`),
  });
  const missing = await runConfirmScriptReview({
    review: null,
    clearScriptReview: () => assert.fail("clear should not run"),
    executeScript: async () => assert.fail("execute should not run"),
  });

  assert.equal(result, true);
  assert.equal(missing, false);
  assert.deepEqual(events, ["clear", "execute:select 1; select 2;"]);
});
