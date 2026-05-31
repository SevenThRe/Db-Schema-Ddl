import test from "node:test";
import assert from "node:assert/strict";
import {
  isActiveWorkbenchRequest,
  resolveWorkbenchCancellationTargets,
  shouldFinalizeWorkbenchRequest,
  shouldIgnoreWorkbenchResponse,
} from "../../client/src/components/extensions/db-workbench/request-lifecycle-runtime";

test("request lifecycle runtime identifies active and stale workbench requests", () => {
  assert.equal(isActiveWorkbenchRequest("request-1", "request-1"), true);
  assert.equal(isActiveWorkbenchRequest("request-1", "request-2"), false);
  assert.equal(isActiveWorkbenchRequest(null, "request-1"), false);

  assert.equal(
    shouldIgnoreWorkbenchResponse({
      activeRequestId: "request-2",
      requestId: "request-1",
    }),
    true,
  );
  assert.equal(
    shouldFinalizeWorkbenchRequest({
      activeRequestId: "request-1",
      requestId: "request-1",
    }),
    true,
  );
});

test("request lifecycle runtime preserves query and export cancellation targets", () => {
  assert.deepEqual(
    resolveWorkbenchCancellationTargets({
      queryRequestId: "query-1",
      exportRequestId: "export-1",
    }),
    {
      queryRequestId: "query-1",
      exportRequestId: "export-1",
    },
  );
});
