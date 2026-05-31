import type { ToastOptions } from "@/extensions/host-api";
import type {
  SqlMemoryAcceptedSuggestionInput,
  SqlMemoryClearOptions,
  SqlMemoryRetentionSettings,
} from "./sql-memory";
import type {
  SqlMemoryCategory,
  SqlMemorySessionResult,
  SqlMemoryStateActions,
} from "./sql-memory-runner";
import {
  runAcceptedSqlSuggestion,
  runClearAllSqlMemory,
  runClearCurrentSchemaSqlMemory,
  runClearSqlMemoryCategory,
  runSqlMemoryRetentionChange,
} from "./sql-memory-runner";

export interface WorkbenchSqlMemoryController {
  handleCompletionAccepted: (suggestion: SqlMemoryAcceptedSuggestionInput) => void;
  handleSqlMemoryRetentionChange: (
    key: keyof SqlMemoryRetentionSettings,
    checked: boolean,
  ) => void;
  handleClearSqlMemoryCategory: (category: SqlMemoryCategory) => void;
  handleClearSqlMemoryCurrentSchema: () => void;
  handleClearAllSqlMemory: () => void;
}

export function createWorkbenchSqlMemoryController(input: {
  connectionId: string;
  runtimeSchema?: string | null;
  actions: SqlMemoryStateActions;
  recordAcceptedSuggestion: (
    connectionId: string,
    suggestion: SqlMemoryAcceptedSuggestionInput,
  ) => SqlMemorySessionResult;
  updateRetention: (
    connectionId: string,
    settings: Partial<SqlMemoryRetentionSettings>,
  ) => SqlMemorySessionResult;
  clearMemory: (
    connectionId: string,
    options?: SqlMemoryClearOptions,
  ) => SqlMemorySessionResult;
  showNotification: (notice: ToastOptions) => void;
}): WorkbenchSqlMemoryController {
  return {
    handleCompletionAccepted: (suggestion) => {
      runAcceptedSqlSuggestion({
        connectionId: input.connectionId,
        suggestion,
        recordAcceptedSuggestion: input.recordAcceptedSuggestion,
        applyMemory: input.actions.applyMemory,
      });
    },
    handleSqlMemoryRetentionChange: (key, checked) => {
      runSqlMemoryRetentionChange({
        connectionId: input.connectionId,
        key,
        checked,
        updateRetention: input.updateRetention,
        applyMemory: input.actions.applyMemory,
        showNotification: input.showNotification,
      });
    },
    handleClearSqlMemoryCategory: (category) => {
      runClearSqlMemoryCategory({
        connectionId: input.connectionId,
        category,
        clearMemory: input.clearMemory,
        applyMemory: input.actions.applyMemory,
        showNotification: input.showNotification,
      });
    },
    handleClearSqlMemoryCurrentSchema: () => {
      runClearCurrentSchemaSqlMemory({
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        clearMemory: input.clearMemory,
        applyMemory: input.actions.applyMemory,
        showNotification: input.showNotification,
      });
    },
    handleClearAllSqlMemory: () => {
      runClearAllSqlMemory({
        connectionId: input.connectionId,
        clearMemory: input.clearMemory,
        applyMemory: input.actions.applyMemory,
        showNotification: input.showNotification,
      });
    },
  };
}
