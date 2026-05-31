import test from "node:test";
import assert from "node:assert/strict";
import type { QueryTab } from "../../client/src/components/extensions/db-workbench/query-tabs-storage";
import { buildWorkbenchSqlWorkspaceContext } from "../../client/src/components/extensions/db-workbench/workbench-sql-workspace-context";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
} from "../../client/src/components/extensions/db-workbench/workbench-session";
import type { PendingSqlParameterReview } from "../../client/src/components/extensions/db-workbench/query-execution-gates";

const tabs: QueryTab[] = [
  {
    id: "tab-1",
    label: "Query 1",
    sql: "select 1",
    connectionId: "conn-1",
  },
  {
    id: "tab-2",
    label: "Query 2",
    sql: "select * from users where id = :id",
    connectionId: "conn-1",
  },
];

const snippets: SavedSqlSnippet[] = [
  {
    id: "snippet-1",
    name: "Find user",
    sql: "select * from users where email = :email",
    updatedAt: "2026-05-31T10:00:00.000Z",
  },
];

const history: QueryRunHistoryEntry[] = [
  {
    id: "run-1",
    sql: "select * from orders",
    executedAt: "2026-05-31T11:00:00.000Z",
    mode: "statement",
    status: "success",
    statementCount: 1,
    returnedRows: 3,
    affectedRows: 0,
    elapsedMs: 12,
    failedStatementIndex: null,
    errorMessage: null,
  },
];

const pendingReview: PendingSqlParameterReview = {
  sql: "select * from users where id = :id",
  source: null,
  cursorOffset: 35,
  parameters: [
    {
      name: "id",
      occurrences: [{ name: "id", start: 31, end: 34, syntax: "colon" }],
    },
  ],
  mode: "statement",
};

test("sql workspace context centralizes active tab, library filtering, and parameter preview", () => {
  const context = buildWorkbenchSqlWorkspaceContext({
    tabs,
    activeTabId: "tab-2",
    savedSnippets: snippets,
    recentQueries: ["select legacy"],
    queryHistory: history,
    sqlLibrarySearch: "orders",
    selectedSqlLibraryEntryId: "missing",
    pendingParameterReview: pendingReview,
    parameterValues: { id: { rawValue: "42" } },
  });

  assert.equal(context.activeTab?.id, "tab-2");
  assert.equal(context.sqlLibraryEntries.length, 2);
  assert.deepEqual(
    context.filteredSqlLibraryEntries.map((entry) => entry.id),
    ["history:run-1"],
  );
  assert.equal(context.selectedSqlLibraryEntry?.id, "history:run-1");
  assert.equal(
    context.renderedParameterReview?.sql,
    "select * from users where id = 42",
  );
});

test("sql workspace context falls back safely for missing active tab and empty reviews", () => {
  const context = buildWorkbenchSqlWorkspaceContext({
    tabs,
    activeTabId: "missing",
    savedSnippets: snippets,
    recentQueries: ["select legacy"],
    queryHistory: [],
    sqlLibrarySearch: "",
    selectedSqlLibraryEntryId: "recent:0",
    pendingParameterReview: null,
    parameterValues: {},
  });

  assert.equal(context.activeTab?.id, "tab-1");
  assert.equal(context.selectedSqlLibraryEntry?.id, "recent:0");
  assert.equal(context.renderedParameterReview, null);
});
