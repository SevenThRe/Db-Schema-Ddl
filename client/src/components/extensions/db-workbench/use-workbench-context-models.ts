import { useMemo } from "react";
import {
  buildWorkbenchSchemaContext,
  type BuildWorkbenchSchemaContextInput,
} from "./workbench-schema-context";
import {
  buildWorkbenchSqlCopilotContext,
  type BuildWorkbenchSqlCopilotContextInput,
} from "./workbench-sql-copilot-context";
import {
  buildWorkbenchSqlWorkspaceContext,
  type BuildWorkbenchSqlWorkspaceContextInput,
} from "./workbench-sql-workspace-context";
import {
  buildWorkbenchSyncSchemaContext,
  type BuildWorkbenchSyncSchemaContextInput,
} from "./workbench-sync-schema-context";

export interface UseWorkbenchContextModelsInput {
  syncSchema: BuildWorkbenchSyncSchemaContextInput;
  schema: BuildWorkbenchSchemaContextInput;
  sqlCopilot: BuildWorkbenchSqlCopilotContextInput;
  sqlWorkspace: BuildWorkbenchSqlWorkspaceContextInput;
}

export function useWorkbenchContextModels(
  input: UseWorkbenchContextModelsInput,
) {
  const syncSchema = input.syncSchema;
  const schema = input.schema;
  const sqlCopilot = input.sqlCopilot;
  const sqlWorkspace = input.sqlWorkspace;

  const syncSchemaContext = useMemo(
    () => buildWorkbenchSyncSchemaContext(syncSchema),
    [
      syncSchema.activeConnectionId,
      syncSchema.activeSchemaError,
      syncSchema.activeSchemaSnapshot,
      syncSchema.connectionCount,
      syncSchema.isSourceSnapshotLoading,
      syncSchema.isTargetSnapshotLoading,
      syncSchema.sourceConnectionId,
      syncSchema.sourceSnapshotData,
      syncSchema.sourceSnapshotError,
      syncSchema.targetConnectionId,
      syncSchema.targetSnapshotData,
      syncSchema.targetSnapshotError,
    ],
  );

  const schemaContext = useMemo(
    () => buildWorkbenchSchemaContext(schema),
    [
      schema.activeSchema,
      schema.connection,
      schema.runtimeSchema,
      schema.schemaOptionsRaw,
      schema.schemaQueryError,
      schema.schemaSnapshot,
      schema.selectedTableName,
      schema.sqlMemory,
    ],
  );

  const sqlCopilotContext = useMemo(
    () => buildWorkbenchSqlCopilotContext(sqlCopilot),
    [
      sqlCopilot.activeTabId,
      sqlCopilot.connection,
      sqlCopilot.ddlSettings,
      sqlCopilot.defaultDdlSettings,
      sqlCopilot.operatorPrompt,
      sqlCopilot.runtimeError,
      sqlCopilot.runtimeSchema,
      sqlCopilot.schemaSnapshot,
      sqlCopilot.selectedTableName,
      sqlCopilot.settingsDraft,
      sqlCopilot.sqlMemory,
      sqlCopilot.tabs,
    ],
  );

  const sqlWorkspaceContext = useMemo(
    () => buildWorkbenchSqlWorkspaceContext(sqlWorkspace),
    [
      sqlWorkspace.activeTabId,
      sqlWorkspace.parameterValues,
      sqlWorkspace.pendingParameterReview,
      sqlWorkspace.queryHistory,
      sqlWorkspace.recentQueries,
      sqlWorkspace.savedSnippets,
      sqlWorkspace.selectedSqlLibraryEntryId,
      sqlWorkspace.sqlLibrarySearch,
      sqlWorkspace.tabs,
    ],
  );

  return {
    syncSchemaContext,
    schemaContext,
    sqlCopilotContext,
    sqlWorkspaceContext,
  };
}
