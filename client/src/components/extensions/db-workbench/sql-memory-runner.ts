import type {
  SqlMemoryAcceptedSuggestionInput,
  SqlMemoryClearOptions,
  SqlMemoryRetentionSettings,
  SqlWorkbenchMemoryState,
} from "./sql-memory";

export type SqlMemoryNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type SqlMemoryCategory =
  NonNullable<SqlMemoryClearOptions["categories"]>[number];

export interface SqlMemorySessionResult {
  sqlMemory: SqlWorkbenchMemoryState;
}

export interface SqlMemoryStateActions {
  applyMemory: (memory: SqlWorkbenchMemoryState) => void;
  openDialog: () => void;
  closeDialog: () => void;
}

export function createSqlMemoryStateActions(input: {
  setSqlMemory: (memory: SqlWorkbenchMemoryState) => void;
  setDialogOpen: (open: boolean) => void;
}): SqlMemoryStateActions {
  return {
    applyMemory: input.setSqlMemory,
    openDialog: () => input.setDialogOpen(true),
    closeDialog: () => input.setDialogOpen(false),
  };
}

export interface RunAcceptedSqlSuggestionInput {
  connectionId: string;
  suggestion: SqlMemoryAcceptedSuggestionInput;
  recordAcceptedSuggestion: (
    connectionId: string,
    suggestion: SqlMemoryAcceptedSuggestionInput,
  ) => SqlMemorySessionResult;
  applyMemory: (memory: SqlWorkbenchMemoryState) => void;
}

export function runAcceptedSqlSuggestion(
  input: RunAcceptedSqlSuggestionInput,
): SqlWorkbenchMemoryState {
  const updatedSession = input.recordAcceptedSuggestion(
    input.connectionId,
    input.suggestion,
  );
  input.applyMemory(updatedSession.sqlMemory);
  return updatedSession.sqlMemory;
}

export interface RunSqlMemoryRetentionChangeInput {
  connectionId: string;
  key: keyof SqlMemoryRetentionSettings;
  checked: boolean;
  updateRetention: (
    connectionId: string,
    settings: Partial<SqlMemoryRetentionSettings>,
  ) => SqlMemorySessionResult;
  applyMemory: (memory: SqlWorkbenchMemoryState) => void;
  showNotification: (notice: SqlMemoryNotice) => void;
}

export function runSqlMemoryRetentionChange(
  input: RunSqlMemoryRetentionChangeInput,
): SqlWorkbenchMemoryState {
  const updatedSession = input.updateRetention(input.connectionId, {
    [input.key]: input.checked,
  });
  input.applyMemory(updatedSession.sqlMemory);
  input.showNotification({
    title: "SQL memory updated",
    description: `${input.key} is now ${
      input.checked ? "enabled" : "paused"
    } for this connection.`,
    variant: "success",
  });
  return updatedSession.sqlMemory;
}

export interface RunClearSqlMemoryCategoryInput {
  connectionId: string;
  category: SqlMemoryCategory;
  clearMemory: (
    connectionId: string,
    options?: SqlMemoryClearOptions,
  ) => SqlMemorySessionResult;
  applyMemory: (memory: SqlWorkbenchMemoryState) => void;
  showNotification: (notice: SqlMemoryNotice) => void;
}

export function runClearSqlMemoryCategory(
  input: RunClearSqlMemoryCategoryInput,
): SqlWorkbenchMemoryState {
  const updatedSession = input.clearMemory(input.connectionId, {
    categories: [input.category],
  });
  input.applyMemory(updatedSession.sqlMemory);
  input.showNotification({
    title: "SQL memory cleared",
    description: `${input.category} were cleared for this connection.`,
    variant: "success",
  });
  return updatedSession.sqlMemory;
}

export interface RunClearCurrentSchemaSqlMemoryInput {
  connectionId: string;
  runtimeSchema?: string | null;
  clearMemory: (
    connectionId: string,
    options?: SqlMemoryClearOptions,
  ) => SqlMemorySessionResult;
  applyMemory: (memory: SqlWorkbenchMemoryState) => void;
  showNotification: (notice: SqlMemoryNotice) => void;
}

export function runClearCurrentSchemaSqlMemory(
  input: RunClearCurrentSchemaSqlMemoryInput,
): SqlWorkbenchMemoryState | null {
  const schemaScope = input.runtimeSchema?.trim();
  if (!schemaScope) {
    input.showNotification({
      title: "Schema scope unavailable",
      description: "This connection does not expose a current schema scope to clear.",
      variant: "default",
    });
    return null;
  }

  const updatedSession = input.clearMemory(input.connectionId, {
    schema: schemaScope,
  });
  input.applyMemory(updatedSession.sqlMemory);
  input.showNotification({
    title: "SQL memory cleared",
    description: `Entries scoped to ${schemaScope} were removed.`,
    variant: "success",
  });
  return updatedSession.sqlMemory;
}

export interface RunClearAllSqlMemoryInput {
  connectionId: string;
  clearMemory: (connectionId: string) => SqlMemorySessionResult;
  applyMemory: (memory: SqlWorkbenchMemoryState) => void;
  showNotification: (notice: SqlMemoryNotice) => void;
}

export function runClearAllSqlMemory(
  input: RunClearAllSqlMemoryInput,
): SqlWorkbenchMemoryState {
  const updatedSession = input.clearMemory(input.connectionId);
  input.applyMemory(updatedSession.sqlMemory);
  input.showNotification({
    title: "SQL memory cleared",
    description: "All adaptive ranking memory for this connection was removed.",
    variant: "success",
  });
  return updatedSession.sqlMemory;
}
