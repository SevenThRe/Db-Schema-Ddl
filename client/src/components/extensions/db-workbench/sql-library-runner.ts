import type { SqlLibraryEntry } from "./sql-library";
import type { SavedSqlSnippet } from "./workbench-session";

export type SqlLibraryNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export interface SqlLibrarySessionResult {
  snippets: SavedSqlSnippet[];
}

export interface SqlLibraryStateActions {
  setPendingSnippetName: (name: string) => void;
  setSaveDialogOpen: (open: boolean) => void;
  applySnippets: (snippets: SavedSqlSnippet[]) => void;
  setLibraryOpen: (open: boolean) => void;
  setSelectedEntryId: (entryId: string) => void;
  openLibrary: (firstEntryId: string) => void;
  closeLibrary: () => void;
}

export function createSqlLibraryStateActions(input: {
  setPendingSnippetName: (name: string) => void;
  setSaveDialogOpen: (open: boolean) => void;
  setSavedSnippets: (snippets: SavedSqlSnippet[]) => void;
  setSqlLibraryOpen: (open: boolean) => void;
  setSqlLibrarySearch: (search: string) => void;
  setSelectedSqlLibraryEntryId: (entryId: string) => void;
}): SqlLibraryStateActions {
  return {
    setPendingSnippetName: input.setPendingSnippetName,
    setSaveDialogOpen: input.setSaveDialogOpen,
    applySnippets: input.setSavedSnippets,
    setLibraryOpen: input.setSqlLibraryOpen,
    setSelectedEntryId: input.setSelectedSqlLibraryEntryId,
    openLibrary: (firstEntryId) => {
      input.setSqlLibrarySearch("");
      input.setSelectedSqlLibraryEntryId(firstEntryId);
      input.setSqlLibraryOpen(true);
    },
    closeLibrary: () => input.setSqlLibraryOpen(false),
  };
}

export interface RunOpenSaveSnippetDialogInput {
  sql: string;
  label?: string | null;
  setPendingSnippetName: (name: string) => void;
  setDialogOpen: (open: boolean) => void;
  showNotification: (notice: SqlLibraryNotice) => void;
}

export function runOpenSaveSnippetDialog(
  input: RunOpenSaveSnippetDialogInput,
): boolean {
  if (!input.sql.trim()) {
    input.showNotification({
      title: "Nothing to save",
      description: "Write SQL in the active tab before saving a snippet.",
      variant: "default",
    });
    return false;
  }

  input.setPendingSnippetName(input.label?.trim() || "Snippet");
  input.setDialogOpen(true);
  return true;
}

export interface RunCancelSaveSnippetDialogInput {
  setPendingSnippetName: (name: string) => void;
  setDialogOpen: (open: boolean) => void;
}

export function runCancelSaveSnippetDialog(
  input: RunCancelSaveSnippetDialogInput,
): void {
  input.setDialogOpen(false);
  input.setPendingSnippetName("");
}

export interface RunConfirmSaveSnippetInput {
  connectionId: string;
  sql: string;
  snippetName: string;
  saveSnippet: (
    connectionId: string,
    name: string,
    sql: string,
  ) => SqlLibrarySessionResult;
  applySnippets: (snippets: SavedSqlSnippet[]) => void;
  setPendingSnippetName: (name: string) => void;
  setDialogOpen: (open: boolean) => void;
  showNotification: (notice: SqlLibraryNotice) => void;
}

export function runConfirmSaveSnippet(
  input: RunConfirmSaveSnippetInput,
): SavedSqlSnippet[] | null {
  const sqlToSave = input.sql;
  const snippetName = input.snippetName.trim();
  if (!sqlToSave.trim()) {
    input.showNotification({
      title: "Nothing to save",
      description: "Write SQL in the active tab before saving a snippet.",
      variant: "default",
    });
    input.setDialogOpen(false);
    input.setPendingSnippetName("");
    return null;
  }

  if (!snippetName) {
    input.showNotification({
      title: "Snippet name required",
      description: "Provide a non-empty snippet name.",
      variant: "destructive",
    });
    return null;
  }

  const updatedSession = input.saveSnippet(
    input.connectionId,
    snippetName,
    sqlToSave,
  );
  input.applySnippets(updatedSession.snippets);
  input.setDialogOpen(false);
  input.setPendingSnippetName("");
  input.showNotification({
    title: "Snippet saved",
    description: `${snippetName} is available for this connection.`,
    variant: "success",
  });
  return updatedSession.snippets;
}

export interface RunReplaceSqlFromLibraryInput {
  entry: SqlLibraryEntry | null;
  replaceSql: (sql: string) => void;
  setLibraryOpen: (open: boolean) => void;
}

export function runReplaceSqlFromLibrary(
  input: RunReplaceSqlFromLibraryInput,
): boolean {
  if (!input.entry) return false;
  input.replaceSql(input.entry.sql);
  input.setLibraryOpen(false);
  return true;
}

export interface RunOpenSqlFromLibraryInNewTabInput {
  entry: SqlLibraryEntry | null;
  openSqlInNewTab: (sql: string, label: string) => void;
  setLibraryOpen: (open: boolean) => void;
}

export function runOpenSqlFromLibraryInNewTab(
  input: RunOpenSqlFromLibraryInNewTabInput,
): boolean {
  if (!input.entry) return false;
  const tabLabel =
    input.entry.kind === "snippet" ? input.entry.title : input.entry.summary;
  input.openSqlInNewTab(input.entry.sql, tabLabel);
  input.setLibraryOpen(false);
  return true;
}

export interface RunDeleteSnippetFromLibraryInput {
  connectionId: string;
  entry: SqlLibraryEntry | null;
  deleteSnippet: (
    connectionId: string,
    snippetId: string,
  ) => SqlLibrarySessionResult;
  applySnippets: (snippets: SavedSqlSnippet[]) => void;
  showNotification: (notice: SqlLibraryNotice) => void;
}

export function runDeleteSnippetFromLibrary(
  input: RunDeleteSnippetFromLibraryInput,
): SavedSqlSnippet[] | null {
  if (!input.entry || input.entry.kind !== "snippet") return null;

  const updatedSession = input.deleteSnippet(
    input.connectionId,
    input.entry.snippetId ?? "",
  );
  input.applySnippets(updatedSession.snippets);
  input.showNotification({
    title: "Snippet deleted",
    description: `${input.entry.title} was removed from this connection library.`,
    variant: "success",
  });
  return updatedSession.snippets;
}

export function runResolveSqlLibrarySelection(input: {
  isOpen: boolean;
  entries: SqlLibraryEntry[];
  selectedEntryId: string;
  setSelectedEntryId: (entryId: string) => void;
}): boolean {
  if (!input.isOpen) return false;

  if (input.entries.length === 0) {
    if (!input.selectedEntryId) return false;
    input.setSelectedEntryId("");
    return true;
  }

  const hasSelection = input.entries.some(
    (entry) => entry.id === input.selectedEntryId,
  );
  if (hasSelection) return false;

  input.setSelectedEntryId(input.entries[0]?.id ?? "");
  return true;
}
