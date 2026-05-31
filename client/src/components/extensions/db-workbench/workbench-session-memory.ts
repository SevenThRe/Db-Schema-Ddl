import {
  clearSqlWorkbenchMemory,
  recordAcceptedSuggestion,
  updateSqlWorkbenchMemoryRetention,
  type SqlMemoryAcceptedSuggestionInput,
  type SqlMemoryClearOptions,
  type SqlMemoryRetentionSettings,
} from "./sql-memory";
import {
  loadSessionForConnection,
  saveSessionForConnection,
} from "./workbench-session-store";
import type { WorkbenchSessionState } from "./workbench-session-types";

export function recordAcceptedSqlSuggestion(
  connectionId: string,
  suggestion: SqlMemoryAcceptedSuggestionInput,
): WorkbenchSessionState {
  const session = loadSessionForConnection(connectionId);
  return saveSessionForConnection(connectionId, {
    ...session,
    sqlMemory: recordAcceptedSuggestion(session.sqlMemory, suggestion),
  });
}

export function updateSqlMemoryRetentionSettings(
  connectionId: string,
  patch: Partial<SqlMemoryRetentionSettings>,
): WorkbenchSessionState {
  const session = loadSessionForConnection(connectionId);
  return saveSessionForConnection(connectionId, {
    ...session,
    sqlMemory: updateSqlWorkbenchMemoryRetention(session.sqlMemory, patch),
  });
}

export function clearSqlMemory(
  connectionId: string,
  options: SqlMemoryClearOptions = {},
): WorkbenchSessionState {
  const session = loadSessionForConnection(connectionId);
  return saveSessionForConnection(connectionId, {
    ...session,
    sqlMemory: clearSqlWorkbenchMemory(session.sqlMemory, options),
  });
}
