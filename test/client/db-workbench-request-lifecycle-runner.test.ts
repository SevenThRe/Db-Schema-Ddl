import test from "node:test";
import assert from "node:assert/strict";

import {
  createRequestLifecycleStateActions,
  runExplainQuery,
  runWorkbenchCancellation,
} from "../../client/src/components/extensions/db-workbench/request-lifecycle-runner";
import type {
  DbExplainPlan,
  ExplainRequest,
} from "../../shared/schema";

function explainPlan(): DbExplainPlan {
  return {
    dialect: "postgres",
    rawJson: "{}",
    root: {
      id: "node-1",
      label: "Seq Scan",
      nodeType: "Seq Scan",
      children: [],
      warnings: [],
    },
  };
}

test("request lifecycle runner executes explain and applies the explain tab", async () => {
  const events: string[] = [];
  const requests: ExplainRequest[] = [];
  const plan = explainPlan();

  const result = await runExplainQuery({
    connectionId: "conn-1",
    sql: "select * from users",
    runtimeSchema: "app",
    isExplaining: false,
    explainQuery: async (request) => {
      requests.push(request);
      return plan;
    },
    beginExplain: () => events.push("begin"),
    setExplainError: (message) => events.push(`error:${message ?? "none"}`),
    setExplainPlan: (nextPlan) => events.push(`plan:${nextPlan?.dialect ?? "none"}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    showNotification: () => assert.fail("notice should not show"),
    finishExplain: () => events.push("finish"),
  });

  assert.equal(result, plan);
  assert.deepEqual(requests, [
    {
      connectionId: "conn-1",
      sql: "select * from users",
      schema: "app",
    },
  ]);
  assert.deepEqual(events, [
    "begin",
    "error:none",
    "plan:postgres",
    "tab:explain",
    "finish",
  ]);
});

test("request lifecycle runner skips blank or in-flight explain requests", async () => {
  const blank = await runExplainQuery({
    connectionId: "conn-1",
    sql: " ",
    isExplaining: false,
    explainQuery: async () => assert.fail("blank explain should not run"),
    beginExplain: () => assert.fail("blank explain should not begin"),
    setExplainError: () => assert.fail("blank explain should not mutate error"),
    setExplainPlan: () => assert.fail("blank explain should not mutate plan"),
    setResultTab: () => assert.fail("blank explain should not switch tab"),
    showNotification: () => assert.fail("blank explain should not notify"),
    finishExplain: () => assert.fail("blank explain should not finish"),
  });
  const busy = await runExplainQuery({
    connectionId: "conn-1",
    sql: "select 1",
    isExplaining: true,
    explainQuery: async () => assert.fail("busy explain should not run"),
    beginExplain: () => assert.fail("busy explain should not begin"),
    setExplainError: () => assert.fail("busy explain should not mutate error"),
    setExplainPlan: () => assert.fail("busy explain should not mutate plan"),
    setResultTab: () => assert.fail("busy explain should not switch tab"),
    showNotification: () => assert.fail("busy explain should not notify"),
    finishExplain: () => assert.fail("busy explain should not finish"),
  });

  assert.equal(blank, null);
  assert.equal(busy, null);
});

test("request lifecycle runner reports explain failures and still finalizes", async () => {
  const events: string[] = [];

  const result = await runExplainQuery({
    connectionId: "conn-1",
    sql: "select * from users",
    isExplaining: false,
    explainQuery: async () => {
      throw new Error("planner offline");
    },
    beginExplain: () => events.push("begin"),
    setExplainError: (message) => events.push(`error:${message ?? "none"}`),
    setExplainPlan: (plan) => events.push(`plan:${plan?.dialect ?? "none"}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.description}`),
    finishExplain: () => events.push("finish"),
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "begin",
    "error:none",
    "plan:none",
    "error:planner offline",
    "tab:explain",
    "notice:Explain 执行失败:planner offline",
    "finish",
  ]);
});

test("request lifecycle runner creates reusable state action objects", () => {
  const events: string[] = [];
  let activeQueryRequestId: string | null = null;
  let activeExportRequestId: string | null = null;
  const actions = createRequestLifecycleStateActions({
    setIsExplaining: (isExplaining) => events.push(`explaining:${isExplaining}`),
    setActiveQueryRequestId: (requestId) => {
      activeQueryRequestId = requestId;
      events.push(`active-query:${requestId ?? "null"}`);
    },
    getActiveQueryRequestId: () => activeQueryRequestId,
    setCurrentRequestId: (requestId) => events.push(`current:${requestId ?? "null"}`),
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    setActiveExportRequestId: (requestId) => {
      activeExportRequestId = requestId;
      events.push(`active-export:${requestId ?? "null"}`);
    },
    setCurrentExportRequestId: (requestId) =>
      events.push(`current-export:${requestId ?? "null"}`),
    setIsExporting: (isExporting) => events.push(`exporting:${isExporting}`),
  });

  actions.beginExplain();
  actions.finishExplain();
  actions.startCancelRequest("query-1");
  actions.finishCancelRequest("query-1");
  actions.startCancelRequest("query-2");
  activeQueryRequestId = "query-3";
  actions.finishCancelRequest("query-2");
  actions.clearQueryRequest();
  actions.clearExportRequest();

  assert.equal(activeQueryRequestId, null);
  assert.equal(activeExportRequestId, null);
  assert.deepEqual(events, [
    "explaining:true",
    "explaining:false",
    "active-query:query-1",
    "current:query-1",
    "executing:true",
    "active-query:null",
    "executing:false",
    "current:null",
    "active-query:query-2",
    "current:query-2",
    "executing:true",
    "executing:false",
    "current:null",
    "active-query:null",
    "executing:false",
    "current:null",
    "active-export:null",
    "exporting:false",
    "current-export:null",
  ]);
});

test("request lifecycle runner cancels query before export and clears local state first", async () => {
  const events: string[] = [];

  const requestId = await runWorkbenchCancellation({
    queryRequestId: "query-1",
    exportRequestId: "export-1",
    clearQueryRequest: () => events.push("clear-query"),
    clearExportRequest: () => events.push("clear-export"),
    cancelQuery: async (id) => events.push(`cancel:${id}`),
  });

  assert.equal(requestId, "query-1");
  assert.deepEqual(events, ["clear-query", "cancel:query-1"]);
});

test("request lifecycle runner cancels export and ignores transport failures", async () => {
  const events: string[] = [];

  const requestId = await runWorkbenchCancellation({
    queryRequestId: null,
    exportRequestId: "export-1",
    clearQueryRequest: () => assert.fail("query state should not clear"),
    clearExportRequest: () => events.push("clear-export"),
    cancelQuery: async (id) => {
      events.push(`cancel:${id}`);
      throw new Error("transport closed");
    },
  });
  const missing = await runWorkbenchCancellation({
    queryRequestId: null,
    exportRequestId: null,
    clearQueryRequest: () => assert.fail("missing request should not clear query"),
    clearExportRequest: () => assert.fail("missing request should not clear export"),
    cancelQuery: async () => assert.fail("missing request should not cancel"),
  });

  assert.equal(requestId, "export-1");
  assert.equal(missing, null);
  assert.deepEqual(events, ["clear-export", "cancel:export-1"]);
});
