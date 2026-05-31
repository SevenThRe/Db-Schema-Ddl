export type {
  WorkbenchResultTab,
  WorkbenchInspectionTarget,
  SessionQueryTab,
  SavedSqlSnippet,
  QueryRunMode,
  QueryRunStatus,
  QueryRunHistoryEntry,
  WorkbenchSessionState,
  RecordQueryRunInput,
} from "./workbench-session-types";

export {
  MAX_RECENT_QUERIES,
  MAX_SNIPPETS,
  MAX_QUERY_HISTORY,
} from "./workbench-session-codec";

export {
  loadSessionForConnection,
  saveSessionForConnection,
} from "./workbench-session-store";

export {
  appendRecentQuery,
  buildQueryRunEntryFromResponse,
  recordQueryRun,
  saveSnippet,
  deleteSnippet,
} from "./workbench-session-history";

export {
  recordAcceptedSqlSuggestion,
  updateSqlMemoryRetentionSettings,
  clearSqlMemory,
} from "./workbench-session-memory";
