import test from "node:test";
import assert from "node:assert/strict";

import type { SqlLibraryEntry } from "../../client/src/components/extensions/db-workbench/sql-library.ts";
import {
  createWorkbenchSqlLibraryController,
} from "../../client/src/components/extensions/db-workbench/workbench-sql-library-controller.ts";

test("workbench sql library controller centralizes snippet and library commands", () => {
  const events: string[] = [];
  let pendingSnippetName = "";
  let saveDialogOpen = false;
  let libraryOpen = true;
  let snippets = [{ id: "old", name: "Old", sql: "select old", updatedAt: null }];
  let replacedSql = "";
  let openedTab: { sql: string; label: string } | null = null;

  const selectedEntry: SqlLibraryEntry = {
    id: "snippet:one",
    kind: "snippet",
    title: "Orders",
    sql: "select * from orders",
    groupLabel: "Saved snippets",
    summary: "select * from orders",
    searchableText: "orders",
    updatedAt: null,
    snippetId: "one",
    meta: null,
    status: null,
  };

  const actions = {
    setPendingSnippetName: (name: string) => {
      pendingSnippetName = name;
      events.push(`pending:${name}`);
    },
    setSaveDialogOpen: (open: boolean) => {
      saveDialogOpen = open;
      events.push(`saveDialog:${open}`);
    },
    applySnippets: (next: typeof snippets) => {
      snippets = next;
      events.push(`snippets:${next.length}`);
    },
    setLibraryOpen: (open: boolean) => {
      libraryOpen = open;
      events.push(`library:${open}`);
    },
    setSelectedEntryId: (entryId: string) => events.push(`selected:${entryId}`),
    openLibrary: (firstEntryId: string) => events.push(`open:${firstEntryId}`),
    closeLibrary: () => events.push("close"),
  };

  const controller = createWorkbenchSqlLibraryController({
    activeSql: "select 1",
    activeLabel: "Query 1",
    connectionId: "conn-a",
    pendingSnippetName: "Saved query",
    selectedEntry,
    actions,
    saveSnippet: (connectionId, name, sql) => {
      events.push(`save:${connectionId}:${name}:${sql}`);
      return {
        snippets: [{ id: "new", name, sql, updatedAt: null }],
      };
    },
    deleteSnippet: (connectionId, snippetId) => {
      events.push(`delete:${connectionId}:${snippetId}`);
      return { snippets: [] };
    },
    replaceSql: (sql) => {
      replacedSql = sql;
      events.push(`replace:${sql}`);
    },
    openSqlInNewTab: (sql, label) => {
      openedTab = { sql, label };
      events.push(`openTab:${label}`);
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  controller.handleSaveSnippet();
  assert.equal(pendingSnippetName, "Query 1");
  assert.equal(saveDialogOpen, true);

  controller.handleConfirmSaveSnippet();
  assert.equal(snippets[0]?.name, "Saved query");
  assert.equal(saveDialogOpen, false);

  controller.handleReplaceSqlFromLibrary();
  assert.equal(replacedSql, selectedEntry.sql);
  assert.equal(libraryOpen, false);

  libraryOpen = true;
  controller.handleOpenSqlFromLibraryInNewTab();
  assert.deepEqual(openedTab, { sql: selectedEntry.sql, label: "Orders" });
  assert.equal(libraryOpen, false);

  controller.handleDeleteSnippetFromLibrary();
  assert.equal(snippets.length, 0);
  assert.ok(events.includes("delete:conn-a:one"));
  assert.ok(events.includes("notice:Snippet deleted"));
});
