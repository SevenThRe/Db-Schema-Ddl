import test from "node:test";
import assert from "node:assert/strict";
import {
  collectFormatterIssue,
  collectLexicalIssues,
  formatSqlText,
  isExplainQuery,
  lineColumnToOffset,
  offsetToMarkerRange,
} from "../../client/src/components/extensions/db-workbench/sql-editor-validation";

test("sql editor validation keeps explain detection comment aware", () => {
  assert.equal(isExplainQuery("/* operator note */\n-- next statement\nEXPLAIN SELECT 1"), true);
  assert.equal(isExplainQuery("SELECT explain FROM audit_log"), false);
});

test("sql editor validation reports lexical ranges without Monaco", () => {
  const issues = collectLexicalIssues("select 'open");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].message, "Unterminated string literal.");
  assert.equal(issues[0].startOffset, 7);
  assert.equal(issues[0].endOffset, 12);
});

test("sql editor validation maps offsets to Monaco marker ranges", () => {
  assert.equal(lineColumnToOffset("one\ntwo", 2, 2), 5);
  assert.deepEqual(offsetToMarkerRange("one\ntwo", 4, 7), {
    startLineNumber: 2,
    startColumn: 1,
    endLineNumber: 2,
    endColumn: 4,
  });
});

test("sql editor validation centralizes formatter integration", () => {
  assert.equal(formatSqlText("select * from users", "mysql"), "SELECT\n  *\nFROM\n  users");
  assert.deepEqual(collectFormatterIssue("", "postgres"), []);
});
