import type { QueryTab } from "./query-tabs-storage";

export type QueryTabRuntimeResult = {
  tabs: QueryTab[];
  activeTabId: string;
};

function createQueryTab(input: {
  id: string;
  label: string;
  sql: string;
  connectionId: string;
}): QueryTab {
  return {
    id: input.id,
    label: input.label,
    sql: input.sql,
    connectionId: input.connectionId,
  };
}

export function replaceQueryTabSql(
  tabs: QueryTab[],
  activeTabId: string,
  sql: string,
): QueryTab[] {
  return tabs.map((tab) => (tab.id === activeTabId ? { ...tab, sql } : tab));
}

export function appendBlankQueryTab(input: {
  tabs: QueryTab[];
  connectionId: string;
  id?: string;
}): QueryTabRuntimeResult {
  const newTab = createQueryTab({
    id: input.id ?? crypto.randomUUID(),
    label: `Query ${input.tabs.length + 1}`,
    sql: "",
    connectionId: input.connectionId,
  });

  return {
    tabs: [...input.tabs, newTab],
    activeTabId: newTab.id,
  };
}

export function closeQueryTab(
  tabs: QueryTab[],
  activeTabId: string,
  tabId: string,
): QueryTabRuntimeResult {
  if (tabs.length <= 1) {
    return { tabs, activeTabId };
  }

  const closedIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (closedIndex < 0) {
    return { tabs, activeTabId };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  const nextActiveTabId =
    activeTabId === tabId
      ? nextTabs[Math.max(0, closedIndex - 1)]?.id ?? activeTabId
      : activeTabId;

  return {
    tabs: nextTabs,
    activeTabId: nextActiveTabId,
  };
}

export function renameQueryTab(
  tabs: QueryTab[],
  tabId: string,
  newLabel: string,
): QueryTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, label: newLabel } : tab));
}

export function openSqlInQueryTab(input: {
  tabs: QueryTab[];
  connectionId: string;
  sql: string;
  label: string;
  id?: string;
}): QueryTabRuntimeResult | null {
  const trimmedSql = input.sql.trim();
  if (!trimmedSql) {
    return null;
  }

  const nextIndex = input.tabs.length + 1;
  const normalizedLabel = input.label.trim();
  const newTab = createQueryTab({
    id: input.id ?? crypto.randomUUID(),
    label: normalizedLabel || `Query ${nextIndex}`,
    sql: trimmedSql,
    connectionId: input.connectionId,
  });

  return {
    tabs: [...input.tabs, newTab],
    activeTabId: newTab.id,
  };
}
