import type { Dispatch, SetStateAction } from "react";
import type { QueryTab } from "./query-tabs-storage";
import {
  appendBlankQueryTab,
  closeQueryTab,
  openSqlInQueryTab,
  renameQueryTab,
  replaceQueryTabSql,
} from "./workbench-tab-runtime";

type SetQueryTabs = Dispatch<SetStateAction<QueryTab[]>>;

export interface QueryTabMutationInput {
  activeTabId: string;
  setTabs: SetQueryTabs;
}

export interface QueryTabSelectionInput {
  setActiveTabId: (tabId: string) => void;
}

export function runReplaceActiveQueryTabSql(
  input: QueryTabMutationInput & { sql: string },
): void {
  input.setTabs((prev) => replaceQueryTabSql(prev, input.activeTabId, input.sql));
}

export function runInsertSqlIntoActiveQueryTab(
  input: QueryTabMutationInput & { sql: string },
): void {
  if (!input.sql.trim()) return;
  runReplaceActiveQueryTabSql(input);
}

export function runSelectQueryTab(
  input: QueryTabSelectionInput & { tabId: string },
): void {
  input.setActiveTabId(input.tabId);
}

export function runAppendBlankQueryTab(
  input: {
    connectionId: string;
    setTabs: SetQueryTabs;
  } & QueryTabSelectionInput,
): void {
  input.setTabs((prev) => {
    const next = appendBlankQueryTab({
      tabs: prev,
      connectionId: input.connectionId,
    });
    input.setActiveTabId(next.activeTabId);
    return next.tabs;
  });
}

export function runCloseQueryTab(
  input: QueryTabMutationInput &
    QueryTabSelectionInput & {
      tabId: string;
    },
): void {
  input.setTabs((prev) => {
    const next = closeQueryTab(prev, input.activeTabId, input.tabId);
    if (next.activeTabId !== input.activeTabId) {
      input.setActiveTabId(next.activeTabId);
    }
    return next.tabs;
  });
}

export function runRenameQueryTab(
  input: {
    tabId: string;
    newLabel: string;
    setTabs: SetQueryTabs;
  },
): void {
  input.setTabs((prev) => renameQueryTab(prev, input.tabId, input.newLabel));
}

export function runOpenSqlInNewQueryTab(
  input: {
    connectionId: string;
    sql: string;
    label: string;
    setTabs: SetQueryTabs;
  } & QueryTabSelectionInput,
): void {
  input.setTabs((prev) => {
    const next = openSqlInQueryTab({
      tabs: prev,
      connectionId: input.connectionId,
      sql: input.sql,
      label: input.label,
    });
    if (!next) return prev;
    input.setActiveTabId(next.activeTabId);
    return next.tabs;
  });
}
