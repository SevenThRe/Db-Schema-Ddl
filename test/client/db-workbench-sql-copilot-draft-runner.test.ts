import test from "node:test";
import assert from "node:assert/strict";

import {
  openGeneratedDraftInNewTab,
  replaceActiveTabWithGeneratedDraft,
  runGeneratedDraftWithSafetyGates,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-draft-runner";
import type { SqlCopilotGeneratedDraft } from "../../client/src/components/extensions/db-workbench/sql-copilot-generation";
import type { DbGridEditSource } from "../../shared/schema";

function generatedDraft(
  sql: string,
  summary: string | null = "List users",
): SqlCopilotGeneratedDraft {
  return {
    sql,
    summary,
    assumptions: [],
    safetyNotes: [],
    completionMode: "natural_language",
    diagnostics: [],
    hallucinationRisk: false,
    safetyRegression: false,
    rawOutput: sql,
  };
}

test("sql copilot draft runner ignores empty replace requests", () => {
  const replaced = replaceActiveTabWithGeneratedDraft({
    draft: generatedDraft("   "),
    insertSqlIntoActiveTab: () => assert.fail("empty draft should not insert"),
    focusSqlEditor: () => assert.fail("empty draft should not focus editor"),
    showNotification: () => assert.fail("empty draft should not notify"),
  });

  assert.equal(replaced, false);
});

test("sql copilot draft runner replaces active tab and focuses editor", () => {
  const events: string[] = [];

  const replaced = replaceActiveTabWithGeneratedDraft({
    draft: generatedDraft(" select id from users "),
    insertSqlIntoActiveTab: (sql) => events.push(`insert:${sql}`),
    focusSqlEditor: () => events.push("focus"),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.variant}`),
  });

  assert.equal(replaced, true);
  assert.deepEqual(events, [
    "insert:select id from users",
    "focus",
    "notice:Generated SQL inserted:success",
  ]);
});

test("sql copilot draft runner opens draft in a new tab with fallback label", () => {
  const events: string[] = [];

  const opened = openGeneratedDraftInNewTab({
    draft: generatedDraft(" select id from users ", null),
    openSqlInNewTab: (sql, label) => events.push(`open:${label}:${sql}`),
    showNotification: (notice) => events.push(`notice:${notice.title}:${notice.variant}`),
  });

  assert.equal(opened, true);
  assert.deepEqual(events, [
    "open:Generated SQL:select id from users",
    "notice:Generated SQL opened:success",
  ]);
});

test("sql copilot draft runner routes multi-statement drafts through script review", async () => {
  const events: string[] = [];

  const route = await runGeneratedDraftWithSafetyGates({
    draft: generatedDraft("select 1; select 2;"),
    runtimeSchema: "app",
    executeScript: async (sql) => events.push(`script:${sql}`),
    executeStatement: async () => assert.fail("multi-statement draft should not execute as statement"),
  });

  assert.equal(route, "script");
  assert.deepEqual(events, ["script:select 1; select 2;"]);
});

test("sql copilot draft runner routes single-statement drafts as custom SQL", async () => {
  const events: string[] = [];

  const route = await runGeneratedDraftWithSafetyGates({
    draft: generatedDraft(" select id from users "),
    runtimeSchema: "app",
    executeScript: async () => assert.fail("single-statement draft should not execute as script"),
    executeStatement: async (
      sql: string,
      source: DbGridEditSource,
      mode: "statement",
      cursorOffset?: number,
    ) => {
      events.push(`${mode}:${source.kind}:${source.schema ?? "none"}:${cursorOffset ?? "none"}:${sql}`);
    },
  });

  assert.equal(route, "statement");
  assert.deepEqual(events, [
    "statement:custom-sql:app:none:select id from users",
  ]);
});

test("sql copilot draft runner skips execution for missing drafts", async () => {
  const route = await runGeneratedDraftWithSafetyGates({
    draft: null,
    executeScript: async () => assert.fail("missing draft should not execute script"),
    executeStatement: async () => assert.fail("missing draft should not execute statement"),
  });

  assert.equal(route, "empty");
});
