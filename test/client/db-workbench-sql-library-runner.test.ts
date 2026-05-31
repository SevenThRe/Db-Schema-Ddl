import test from "node:test";
import assert from "node:assert/strict";

import {
  createSqlLibraryStateActions,
  runCancelSaveSnippetDialog,
  runConfirmSaveSnippet,
  runDeleteSnippetFromLibrary,
  runOpenSaveSnippetDialog,
  runOpenSqlFromLibraryInNewTab,
  runReplaceSqlFromLibrary,
  runResolveSqlLibrarySelection,
} from "../../client/src/components/extensions/db-workbench/sql-library-runner";
import type { SqlLibraryEntry } from "../../client/src/components/extensions/db-workbench/sql-library";
import type { SavedSqlSnippet } from "../../client/src/components/extensions/db-workbench/workbench-session";

function snippetEntry(): SqlLibraryEntry {
  return {
    id: "snippet:snippet-1",
    kind: "snippet",
    title: "Find users",
    sql: "select * from users",
    groupLabel: "Saved snippets",
    summary: "select * from users",
    searchableText: "find users",
    updatedAt: "2026-05-31T00:00:00.000Z",
    snippetId: "snippet-1",
    meta: "Saved 2026-05-31 00:00",
    status: null,
  };
}

function historyEntry(): SqlLibraryEntry {
  return {
    ...snippetEntry(),
    id: "history:run-1",
    kind: "history",
    title: "Statement run",
    summary: "select id from users",
    sql: "select id from users",
    snippetId: null,
    status: "success",
  };
}

function snippet(id: string): SavedSqlSnippet {
  return {
    id,
    name: "Find users",
    sql: "select * from users",
    updatedAt: "2026-05-31T00:00:00.000Z",
  };
}

test("sql library runner opens save dialog with active tab label and blocks empty SQL", () => {
  const events: string[] = [];

  const opened = runOpenSaveSnippetDialog({
    sql: " select 1 ",
    label: " Scratch ",
    setPendingSnippetName: (name) => events.push(`name:${name}`),
    setDialogOpen: (open) => events.push(`open:${open}`),
    showNotification: () => assert.fail("notification should not show"),
  });
  const blocked = runOpenSaveSnippetDialog({
    sql: "   ",
    label: "Scratch",
    setPendingSnippetName: () => assert.fail("name should not change"),
    setDialogOpen: () => assert.fail("dialog should not open"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  assert.equal(opened, true);
  assert.equal(blocked, false);
  assert.deepEqual(events, ["name:Scratch", "open:true", "notice:Nothing to save"]);
});

test("sql library runner cancels save snippet dialog", () => {
  const events: string[] = [];

  runCancelSaveSnippetDialog({
    setDialogOpen: (open) => events.push(`open:${open}`),
    setPendingSnippetName: (name) => events.push(`name:${name}`),
  });

  assert.deepEqual(events, ["open:false", "name:"]);
});

test("sql library runner confirms snippet save and preserves validation behavior", () => {
  const savedSnippets = [snippet("snippet-1")];
  const events: string[] = [];
  const saveCalls: unknown[] = [];

  const result = runConfirmSaveSnippet({
    connectionId: "conn-1",
    sql: " select * from users ",
    snippetName: " Users ",
    saveSnippet: (connectionId, name, sql) => {
      saveCalls.push({ connectionId, name, sql });
      return { snippets: savedSnippets };
    },
    applySnippets: (snippets) => events.push(`snippets:${snippets.length}`),
    setDialogOpen: (open) => events.push(`open:${open}`),
    setPendingSnippetName: (name) => events.push(`name:${name}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });
  const missingName = runConfirmSaveSnippet({
    connectionId: "conn-1",
    sql: "select 1",
    snippetName: " ",
    saveSnippet: () => assert.fail("save should not run"),
    applySnippets: () => assert.fail("snippets should not apply"),
    setDialogOpen: () => assert.fail("dialog should stay open"),
    setPendingSnippetName: () => assert.fail("name should stay"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });
  const missingSql = runConfirmSaveSnippet({
    connectionId: "conn-1",
    sql: " ",
    snippetName: "Users",
    saveSnippet: () => assert.fail("save should not run"),
    applySnippets: () => assert.fail("snippets should not apply"),
    setDialogOpen: (open) => events.push(`open:${open}`),
    setPendingSnippetName: (name) => events.push(`name:${name}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  assert.equal(result, savedSnippets);
  assert.equal(missingName, null);
  assert.equal(missingSql, null);
  assert.deepEqual(saveCalls, [
    {
      connectionId: "conn-1",
      name: "Users",
      sql: " select * from users ",
    },
  ]);
  assert.deepEqual(events, [
    "snippets:1",
    "open:false",
    "name:",
    "notice:Snippet saved",
    "notice:Snippet name required",
    "notice:Nothing to save",
    "open:false",
    "name:",
  ]);
});

test("sql library runner replaces active tab and opens library SQL in new tabs", () => {
  const events: string[] = [];

  const replaced = runReplaceSqlFromLibrary({
    entry: snippetEntry(),
    replaceSql: (sql) => events.push(`replace:${sql}`),
    setLibraryOpen: (open) => events.push(`library:${open}`),
  });
  const opened = runOpenSqlFromLibraryInNewTab({
    entry: historyEntry(),
    openSqlInNewTab: (sql, label) => events.push(`open:${label}:${sql}`),
    setLibraryOpen: (open) => events.push(`library:${open}`),
  });
  const ignored = runReplaceSqlFromLibrary({
    entry: null,
    replaceSql: () => assert.fail("replace should not run"),
    setLibraryOpen: () => assert.fail("library should not close"),
  });

  assert.equal(replaced, true);
  assert.equal(opened, true);
  assert.equal(ignored, false);
  assert.deepEqual(events, [
    "replace:select * from users",
    "library:false",
    "open:select id from users:select id from users",
    "library:false",
  ]);
});

test("sql library runner deletes only snippet entries from the connection library", () => {
  const nextSnippets = [snippet("snippet-2")];
  const events: string[] = [];
  const calls: unknown[] = [];

  const deleted = runDeleteSnippetFromLibrary({
    connectionId: "conn-1",
    entry: snippetEntry(),
    deleteSnippet: (connectionId, snippetId) => {
      calls.push({ connectionId, snippetId });
      return { snippets: nextSnippets };
    },
    applySnippets: (snippets) => events.push(`snippets:${snippets.length}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });
  const ignored = runDeleteSnippetFromLibrary({
    connectionId: "conn-1",
    entry: historyEntry(),
    deleteSnippet: () => assert.fail("delete should not run"),
    applySnippets: () => assert.fail("snippets should not apply"),
    showNotification: () => assert.fail("notice should not show"),
  });

  assert.equal(deleted, nextSnippets);
  assert.equal(ignored, null);
  assert.deepEqual(calls, [{ connectionId: "conn-1", snippetId: "snippet-1" }]);
  assert.deepEqual(events, ["snippets:1", "notice:Snippet deleted"]);
});

test("sql library runner repairs selection only while the library is open", () => {
  const entries = [snippetEntry(), historyEntry()];
  const events: string[] = [];

  const closed = runResolveSqlLibrarySelection({
    isOpen: false,
    entries,
    selectedEntryId: "missing",
    setSelectedEntryId: (entryId) => events.push(`closed:${entryId}`),
  });
  const repaired = runResolveSqlLibrarySelection({
    isOpen: true,
    entries,
    selectedEntryId: "missing",
    setSelectedEntryId: (entryId) => events.push(`repair:${entryId}`),
  });
  const kept = runResolveSqlLibrarySelection({
    isOpen: true,
    entries,
    selectedEntryId: entries[1].id,
    setSelectedEntryId: (entryId) => events.push(`keep:${entryId}`),
  });
  const cleared = runResolveSqlLibrarySelection({
    isOpen: true,
    entries: [],
    selectedEntryId: "history:run-1",
    setSelectedEntryId: (entryId) => events.push(`clear:${entryId}`),
  });

  assert.equal(closed, false);
  assert.equal(repaired, true);
  assert.equal(kept, false);
  assert.equal(cleared, true);
  assert.deepEqual(events, ["repair:snippet:snippet-1", "clear:"]);
});

test("sql library runner creates reusable state action objects", () => {
  const events: string[] = [];
  const actions = createSqlLibraryStateActions({
    setPendingSnippetName: (name) => events.push(`name:${name}`),
    setSaveDialogOpen: (open) => events.push(`save-open:${open}`),
    setSavedSnippets: (snippets) => events.push(`snippets:${snippets.length}`),
    setSqlLibraryOpen: (open) => events.push(`library-open:${open}`),
    setSqlLibrarySearch: (search) => events.push(`search:${search}`),
    setSelectedSqlLibraryEntryId: (entryId) => events.push(`selected:${entryId}`),
  });

  actions.openLibrary("snippet:snippet-1");
  actions.setPendingSnippetName("Find users");
  actions.setSaveDialogOpen(true);
  actions.applySnippets([snippet("snippet-1")]);
  actions.setSelectedEntryId("history:run-1");
  actions.closeLibrary();

  assert.deepEqual(events, [
    "search:",
    "selected:snippet:snippet-1",
    "library-open:true",
    "name:Find users",
    "save-open:true",
    "snippets:1",
    "selected:history:run-1",
    "library-open:false",
  ]);
});
