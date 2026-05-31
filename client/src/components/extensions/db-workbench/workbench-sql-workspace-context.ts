import type { QueryTab } from "./query-tabs-storage";
import type { PendingSqlParameterReview } from "./query-execution-gates";
import {
  type SqlParameterInputValue,
  renderSqlParameters,
} from "./sql-parameters";
import {
  buildSqlLibraryEntries,
  filterSqlLibraryEntries,
} from "./sql-library";
import type {
  QueryRunHistoryEntry,
  SavedSqlSnippet,
} from "./workbench-session";

export interface BuildWorkbenchSqlWorkspaceContextInput {
  tabs: QueryTab[];
  activeTabId: string;
  savedSnippets: SavedSqlSnippet[];
  recentQueries: string[];
  queryHistory: QueryRunHistoryEntry[];
  sqlLibrarySearch: string;
  selectedSqlLibraryEntryId: string;
  pendingParameterReview: PendingSqlParameterReview | null;
  parameterValues: Record<string, SqlParameterInputValue>;
}

export function buildWorkbenchSqlWorkspaceContext(
  input: BuildWorkbenchSqlWorkspaceContextInput,
) {
  const activeTab =
    input.tabs.find((tab) => tab.id === input.activeTabId) ??
    input.tabs[0] ??
    null;
  const sqlLibraryEntries = buildSqlLibraryEntries(
    input.savedSnippets,
    input.recentQueries,
    input.queryHistory,
  );
  const filteredSqlLibraryEntries = filterSqlLibraryEntries(
    sqlLibraryEntries,
    input.sqlLibrarySearch,
  );
  const selectedSqlLibraryEntry =
    filteredSqlLibraryEntries.find(
      (entry) => entry.id === input.selectedSqlLibraryEntryId,
    ) ??
    filteredSqlLibraryEntries[0] ??
    null;
  const renderedParameterReview = input.pendingParameterReview
    ? renderSqlParameters(
        input.pendingParameterReview.sql,
        input.parameterValues,
        input.pendingParameterReview.cursorOffset,
      )
    : null;

  return {
    activeTab,
    sqlLibraryEntries,
    filteredSqlLibraryEntries,
    selectedSqlLibraryEntry,
    renderedParameterReview,
  };
}
