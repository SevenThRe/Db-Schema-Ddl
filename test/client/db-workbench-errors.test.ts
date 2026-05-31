import test from "node:test";
import assert from "node:assert/strict";
import {
  formatWorkbenchError,
  isCancelledQueryMessage,
} from "../../client/src/components/extensions/db-workbench/workbench-errors";

test("workbench error formatter removes invoke wrappers while preserving useful details", () => {
  assert.equal(
    formatWorkbenchError(
      "Error invoking db_query_execute: Error: syntax error near FROM",
      "fallback",
    ),
    "syntax error near FROM",
  );
  assert.equal(
    formatWorkbenchError(new Error("Error: connection refused"), "fallback"),
    "connection refused",
  );
  assert.equal(formatWorkbenchError(null, "fallback message"), "fallback message");
});

test("workbench cancel detection accepts common English and Japanese runtime messages", () => {
  assert.equal(isCancelledQueryMessage("query cancelled by user"), true);
  assert.equal(isCancelledQueryMessage("request was canceled"), true);
  assert.equal(isCancelledQueryMessage("クエリがキャンセルされました"), true);
  assert.equal(isCancelledQueryMessage("syntax error"), false);
});
