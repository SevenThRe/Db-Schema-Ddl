import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitialSqlParameterValues,
  buildPendingSqlParameterReview,
  buildPendingSqlScriptReview,
  countSqlStatementsForHistory,
  shouldSkipQueryExecution,
} from "../../client/src/components/extensions/db-workbench/query-execution-gates";

test("query execution gate skips empty, executing, and exporting requests", () => {
  assert.equal(shouldSkipQueryExecution({ sql: "   ", isExecuting: false }), true);
  assert.equal(shouldSkipQueryExecution({ sql: "select 1", isExecuting: true }), true);
  assert.equal(
    shouldSkipQueryExecution({ sql: "select 1", isExecuting: false, isExporting: true }),
    true,
  );
  assert.equal(
    shouldSkipQueryExecution({ sql: "select 1", isExecuting: false, isExporting: false }),
    false,
  );
});

test("query execution gate builds parameter review and initial blank values", () => {
  const review = buildPendingSqlParameterReview({
    sql: "select * from users where id = :user_id and status = {{status}}",
    source: null,
    cursorOffset: 9,
    mode: "statement",
  });

  assert.ok(review);
  assert.deepEqual(
    review.parameters.map((parameter) => parameter.name),
    ["user_id", "status"],
  );
  assert.deepEqual(buildInitialSqlParameterValues(review.parameters), {
    user_id: { rawValue: "" },
    status: { rawValue: "" },
  });
});

test("query execution gate returns no parameter review when SQL has no placeholders", () => {
  assert.equal(
    buildPendingSqlParameterReview({
      sql: "select * from users",
      source: null,
      mode: "statement",
    }),
    null,
  );
});

test("query execution gate builds script review only for multi-statement SQL", () => {
  assert.equal(buildPendingSqlScriptReview("select 1"), null);

  const review = buildPendingSqlScriptReview("select 1; update users set active = false;");

  assert.ok(review);
  assert.equal(review.statements.length, 2);
  assert.equal(review.statements[0]?.kind, "select");
  assert.equal(review.statements[1]?.kind, "dml");
});

test("query execution gate counts script statements for failed-run history", () => {
  assert.equal(countSqlStatementsForHistory("select 1", "statement"), 1);
  assert.equal(countSqlStatementsForHistory("select 1; select 2;", "script"), 2);
  assert.equal(countSqlStatementsForHistory("   ", "script"), 1);
});
