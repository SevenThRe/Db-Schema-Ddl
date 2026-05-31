import type {
  DbConnectionConfig,
  DbGridEditSource,
  DbTableSchema,
} from "@shared/schema";
import {
  runSchemaChange,
  runStarterTableQuery,
  type NavigationStateActions,
} from "./workbench-navigation-runner";
import type { WorkbenchSchemaNotice } from "./workbench-schema-runtime";
import type { WorkbenchResultTab } from "./workbench-session";
import type { StarterQueryMode } from "./table-query-utils";

export interface WorkbenchNavigationController {
  handleSwitchConnection: (connectionId: string) => void;
  handleSchemaChange: (nextSchema: string) => Promise<void>;
  handleSelectTable: (tableName: string) => void;
  handleRunStarterQuery: (
    tableName: string,
    mode: StarterQueryMode,
  ) => Promise<void>;
  handleOpenTable: (tableName: string) => Promise<void>;
}

export function createWorkbenchNavigationController(input: {
  connection: DbConnectionConfig;
  activeSchema: string;
  tables?: DbTableSchema[];
  runtimeSchema?: string;
  snapshotSchema?: string | null;
  actions: NavigationStateActions;
  onSwitchConnection: (connectionId: string) => void;
  saveConnection: (connection: DbConnectionConfig) => Promise<unknown>;
  invalidateConnections: () => Promise<unknown>;
  refetchSchema: () => Promise<unknown>;
  refetchSchemaOptions: () => Promise<unknown>;
  applyActiveSchema: (schema: string) => void;
  updateActiveTabSql: (sql: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setLastGridEditSource: (source: DbGridEditSource) => void;
  focusSqlEditor: () => void;
  executeQuery: (sql: string, source: DbGridEditSource) => Promise<unknown>;
  showNotification: (notice: WorkbenchSchemaNotice) => void;
}): WorkbenchNavigationController {
  const handleRunStarterQuery = async (
    tableName: string,
    mode: StarterQueryMode,
  ) => {
    await runStarterTableQuery({
      connection: input.connection,
      tableName,
      mode,
      tables: input.tables,
      runtimeSchema: input.runtimeSchema,
      snapshotSchema: input.snapshotSchema,
      selectTable: input.actions.selectTable,
      updateActiveTabSql: input.updateActiveTabSql,
      setResultTab: input.setResultTab,
      setLastGridEditSource: input.setLastGridEditSource,
      focusSqlEditor: input.focusSqlEditor,
      executeQuery: input.executeQuery,
    });
  };

  return {
    handleSwitchConnection: (connectionId) => {
      if (connectionId === input.connection.id) return;
      input.onSwitchConnection(connectionId);
    },
    handleSchemaChange: async (nextSchema) => {
      await runSchemaChange({
        connection: input.connection,
        activeSchema: input.activeSchema,
        nextSchema,
        saveConnection: input.saveConnection,
        invalidateConnections: input.invalidateConnections,
        refetchSchema: input.refetchSchema,
        refetchSchemaOptions: input.refetchSchemaOptions,
        applyActiveSchema: input.applyActiveSchema,
        applyQueryWorkspaceReset: input.actions.applyQueryWorkspaceReset,
        showNotification: input.showNotification,
      });
    },
    handleSelectTable: input.actions.selectTable,
    handleRunStarterQuery,
    handleOpenTable: async (tableName) => {
      await handleRunStarterQuery(tableName, "select");
    },
  };
}
