import type { Dispatch, SetStateAction } from "react";
import type { QueryTab } from "./query-tabs-storage";
import {
  runAppendBlankQueryTab,
  runCloseQueryTab,
  runInsertSqlIntoActiveQueryTab,
  runOpenSqlInNewQueryTab,
  runRenameQueryTab,
  runReplaceActiveQueryTabSql,
  runSelectQueryTab,
} from "./workbench-tab-runner";

type SetQueryTabs = Dispatch<SetStateAction<QueryTab[]>>;

export interface WorkbenchTabController {
  handleSqlChange: (sql: string) => void;
  updateActiveTabSql: (sql: string) => void;
  focusSqlEditor: () => void;
  handleTabChange: (tabId: string) => void;
  handleTabAdd: () => void;
  handleTabClose: (tabId: string) => void;
  handleTabRename: (tabId: string, newLabel: string) => void;
  handleCloseActiveTab: () => void;
  insertSqlIntoActiveTab: (sql: string) => void;
  openSqlInNewTab: (sql: string, label: string) => void;
}

export function focusBrowserSqlEditor(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    const input = document.querySelector<HTMLTextAreaElement>(
      ".monaco-editor textarea.inputarea",
    );
    input?.focus();
  });
}

export function createWorkbenchTabController(input: {
  activeTabId: string;
  connectionId: string;
  setActiveTabId: (tabId: string) => void;
  setTabs: SetQueryTabs;
  focusSqlEditor?: () => void;
}): WorkbenchTabController {
  const updateActiveTabSql = (sql: string) => {
    runReplaceActiveQueryTabSql({
      activeTabId: input.activeTabId,
      sql,
      setTabs: input.setTabs,
    });
  };

  const handleTabClose = (tabId: string) => {
    runCloseQueryTab({
      activeTabId: input.activeTabId,
      tabId,
      setActiveTabId: input.setActiveTabId,
      setTabs: input.setTabs,
    });
  };

  return {
    handleSqlChange: updateActiveTabSql,
    updateActiveTabSql,
    focusSqlEditor: input.focusSqlEditor ?? focusBrowserSqlEditor,
    handleTabChange: (tabId) => {
      runSelectQueryTab({ tabId, setActiveTabId: input.setActiveTabId });
    },
    handleTabAdd: () => {
      runAppendBlankQueryTab({
        connectionId: input.connectionId,
        setActiveTabId: input.setActiveTabId,
        setTabs: input.setTabs,
      });
    },
    handleTabClose,
    handleTabRename: (tabId, newLabel) => {
      runRenameQueryTab({ tabId, newLabel, setTabs: input.setTabs });
    },
    handleCloseActiveTab: () => {
      handleTabClose(input.activeTabId);
    },
    insertSqlIntoActiveTab: (sql) => {
      runInsertSqlIntoActiveQueryTab({
        activeTabId: input.activeTabId,
        sql,
        setTabs: input.setTabs,
      });
    },
    openSqlInNewTab: (sql, label) => {
      runOpenSqlInNewQueryTab({
        connectionId: input.connectionId,
        sql,
        label,
        setActiveTabId: input.setActiveTabId,
        setTabs: input.setTabs,
      });
    },
  };
}
