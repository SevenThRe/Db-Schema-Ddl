import type { ToastOptions } from "@/extensions/host-api";
import type { SqlLibraryEntry } from "./sql-library";
import {
  runCancelSaveSnippetDialog,
  runConfirmSaveSnippet,
  runDeleteSnippetFromLibrary,
  runOpenSaveSnippetDialog,
  runOpenSqlFromLibraryInNewTab,
  runReplaceSqlFromLibrary,
  type SqlLibraryStateActions,
} from "./sql-library-runner";
import type { SqlLibrarySessionResult } from "./sql-library-runner";

export interface WorkbenchSqlLibraryController {
  handleSaveSnippet: () => void;
  handleCancelSaveSnippet: () => void;
  handleConfirmSaveSnippet: () => void;
  handleReplaceSqlFromLibrary: () => void;
  handleOpenSqlFromLibraryInNewTab: () => void;
  handleDeleteSnippetFromLibrary: () => void;
}

export function createWorkbenchSqlLibraryController(input: {
  activeSql: string;
  activeLabel?: string | null;
  connectionId: string;
  pendingSnippetName: string;
  selectedEntry: SqlLibraryEntry | null;
  actions: SqlLibraryStateActions;
  saveSnippet: (
    connectionId: string,
    name: string,
    sql: string,
  ) => SqlLibrarySessionResult;
  deleteSnippet: (
    connectionId: string,
    snippetId: string,
  ) => SqlLibrarySessionResult;
  replaceSql: (sql: string) => void;
  openSqlInNewTab: (sql: string, label: string) => void;
  showNotification: (notice: ToastOptions) => void;
}): WorkbenchSqlLibraryController {
  return {
    handleSaveSnippet: () => {
      runOpenSaveSnippetDialog({
        sql: input.activeSql,
        label: input.activeLabel,
        setPendingSnippetName: input.actions.setPendingSnippetName,
        setDialogOpen: input.actions.setSaveDialogOpen,
        showNotification: input.showNotification,
      });
    },
    handleCancelSaveSnippet: () => {
      runCancelSaveSnippetDialog({
        setDialogOpen: input.actions.setSaveDialogOpen,
        setPendingSnippetName: input.actions.setPendingSnippetName,
      });
    },
    handleConfirmSaveSnippet: () => {
      runConfirmSaveSnippet({
        connectionId: input.connectionId,
        sql: input.activeSql,
        snippetName: input.pendingSnippetName,
        saveSnippet: input.saveSnippet,
        applySnippets: input.actions.applySnippets,
        setDialogOpen: input.actions.setSaveDialogOpen,
        setPendingSnippetName: input.actions.setPendingSnippetName,
        showNotification: input.showNotification,
      });
    },
    handleReplaceSqlFromLibrary: () => {
      runReplaceSqlFromLibrary({
        entry: input.selectedEntry,
        replaceSql: input.replaceSql,
        setLibraryOpen: input.actions.setLibraryOpen,
      });
    },
    handleOpenSqlFromLibraryInNewTab: () => {
      runOpenSqlFromLibraryInNewTab({
        entry: input.selectedEntry,
        openSqlInNewTab: input.openSqlInNewTab,
        setLibraryOpen: input.actions.setLibraryOpen,
      });
    },
    handleDeleteSnippetFromLibrary: () => {
      runDeleteSnippetFromLibrary({
        connectionId: input.connectionId,
        entry: input.selectedEntry,
        deleteSnippet: input.deleteSnippet,
        applySnippets: input.actions.applySnippets,
        showNotification: input.showNotification,
      });
    },
  };
}
