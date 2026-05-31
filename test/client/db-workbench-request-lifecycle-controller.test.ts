import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchRequestLifecycleController,
} from "../../client/src/components/extensions/db-workbench/workbench-request-lifecycle-controller";
import type { DbExplainPlan, ExplainRequest } from "../../shared/schema";

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

test("workbench request lifecycle controller centralizes explain and cancel commands", async () => {
  const events: string[] = [];
  const explainRequests: ExplainRequest[] = [];
  const cancelRequests: string[] = [];
  const plan = explainPlan();

  const controller = createWorkbenchRequestLifecycleController({
    connectionId: "conn-1",
    runtimeSchema: "app",
    isExplaining: false,
    currentRequestId: "query-1",
    currentExportRequestId: "export-1",
    actions: {
      beginExplain: () => events.push("explain:begin"),
      finishExplain: () => events.push("explain:finish"),
      clearQueryRequest: () => events.push("clear:query"),
      clearExportRequest: () => events.push("clear:export"),
      startCancelRequest: (requestId) => events.push(`start-cancel:${requestId}`),
      finishCancelRequest: (requestId) => events.push(`finish-cancel:${requestId}`),
    },
    explainQuery: async (request) => {
      explainRequests.push(request);
      return plan;
    },
    cancelQuery: async (requestId) => {
      cancelRequests.push(requestId);
    },
    setExplainError: (message) => events.push(`error:${message ?? "none"}`),
    setExplainPlan: (nextPlan) => events.push(`plan:${nextPlan?.dialect ?? "none"}`),
    setResultTab: (tab) => events.push(`tab:${tab}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  await controller.handleExplain("select * from users");
  await controller.handleCancel();

  assert.deepEqual(explainRequests, [
    {
      connectionId: "conn-1",
      sql: "select * from users",
      schema: "app",
    },
  ]);
  assert.deepEqual(cancelRequests, ["query-1"]);
  assert.deepEqual(events, [
    "explain:begin",
    "error:none",
    "plan:postgres",
    "tab:explain",
    "explain:finish",
    "clear:query",
  ]);
});
