import { useQuery } from "@tanstack/react-query";

import { desktopBridge } from "@/lib/desktop-bridge";
import type { HostApi } from "@/extensions/host-api";
import type {
  DbConnectionConfig,
  DdlSettings,
} from "@shared/schema";

import {
  CONNECTIONS_QUERY_KEY,
  SETTINGS_QUERY_KEY,
} from "./workbench-query-cache";

export interface UseWorkbenchBackendQueriesInput {
  connection: DbConnectionConfig;
  hostApi: HostApi;
  defaultDdlSettings: DdlSettings;
  syncSourceConnectionId: string;
  syncTargetConnectionId: string;
  sqlCopilotOpen: boolean;
}

export function useWorkbenchBackendQueries({
  connection,
  hostApi,
  defaultDdlSettings,
  syncSourceConnectionId,
  syncTargetConnectionId,
  sqlCopilotOpen,
}: UseWorkbenchBackendQueriesInput) {
  const connectionsQuery = useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: () => hostApi.connections.list(),
  });
  const ddlSettingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => desktopBridge.settings.get(),
    staleTime: 30_000,
    retry: false,
  });
  const schemaQuery = useQuery({
    queryKey: ["db-workbench-schema", connection.id],
    queryFn: () => hostApi.connections.introspect(connection.id),
    staleTime: 30_000,
    retry: false,
  });
  const syncSourceSchemaQuery = useQuery({
    queryKey: ["db-workbench-sync-schema", syncSourceConnectionId],
    queryFn: () => hostApi.connections.introspect(syncSourceConnectionId),
    staleTime: 30_000,
    retry: false,
    enabled: syncSourceConnectionId !== connection.id,
  });
  const syncTargetSchemaQuery = useQuery({
    queryKey: ["db-workbench-sync-schema", syncTargetConnectionId],
    queryFn: () => hostApi.connections.introspect(syncTargetConnectionId),
    staleTime: 30_000,
    retry: false,
    enabled: syncTargetConnectionId !== connection.id,
  });
  const schemaOptionsQuery = useQuery({
    queryKey: ["db-workbench-schema-options", connection.id],
    queryFn: async () => {
      if (!hostApi.connections.listSchemas) return [];
      return await hostApi.connections.listSchemas(connection.id);
    },
    enabled: connection.driver === "postgres",
    staleTime: 30_000,
    retry: false,
  });

  const ddlSettings = ddlSettingsQuery.data;
  const sqlCopilotRuntimeQuery = useQuery({
    queryKey: [
      "db-workbench-sql-copilot-runtime",
      ddlSettings?.sqlCopilotEnabled ?? defaultDdlSettings.sqlCopilotEnabled,
      ddlSettings?.sqlCopilotProvider ?? defaultDdlSettings.sqlCopilotProvider,
      ddlSettings?.sqlCopilotOllamaBaseUrl ?? defaultDdlSettings.sqlCopilotOllamaBaseUrl,
      ddlSettings?.sqlCopilotOllamaModel ?? "",
      ddlSettings?.sqlCopilotLlamaCliPath ?? "",
      ddlSettings?.sqlCopilotLlamaModelPath ?? "",
    ],
    queryFn: () => hostApi.connections.getSqlCopilotRuntimeState({ refresh: true }),
    enabled: sqlCopilotOpen,
    staleTime: 0,
    retry: false,
  });

  return {
    connections: connectionsQuery.data ?? [],
    ddlSettings,
    ddlSettingsError: ddlSettingsQuery.error,
    schemaSnapshot: schemaQuery.data,
    isSchemaLoading: schemaQuery.isFetching,
    schemaQueryError: schemaQuery.error,
    refetchSchema: schemaQuery.refetch,
    syncSourceSnapshotData: syncSourceSchemaQuery.data,
    isSyncSourceSnapshotLoading: syncSourceSchemaQuery.isFetching,
    syncSourceSnapshotError: syncSourceSchemaQuery.error,
    syncTargetSnapshotData: syncTargetSchemaQuery.data,
    isSyncTargetSnapshotLoading: syncTargetSchemaQuery.isFetching,
    syncTargetSnapshotError: syncTargetSchemaQuery.error,
    schemaOptionsRaw: schemaOptionsQuery.data ?? [],
    isSchemaOptionsLoading: schemaOptionsQuery.isFetching,
    schemaOptionsError: schemaOptionsQuery.error,
    refetchSchemaOptions: schemaOptionsQuery.refetch,
    sqlCopilotRuntimeState: sqlCopilotRuntimeQuery.data,
    isSqlCopilotRuntimeLoading: sqlCopilotRuntimeQuery.isFetching,
    sqlCopilotRuntimeError: sqlCopilotRuntimeQuery.error,
    refetchSqlCopilotRuntime: sqlCopilotRuntimeQuery.refetch,
  };
}
