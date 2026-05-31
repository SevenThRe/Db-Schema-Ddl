import type { DbConnectionConfig } from "@shared/schema";

export interface BuildWorkbenchConnectionContextInput {
  connection: DbConnectionConfig;
  connections: DbConnectionConfig[];
  schemaDiffTargetConnectionId: string;
  syncSourceConnectionId: string;
  syncTargetConnectionId: string;
}

export interface WorkbenchConnectionContext {
  sourceConnectionLabel: string;
  schemaDiffTargetConnectionLabel: string | null;
  schemaDiffConnectionOptions: DbConnectionConfig[];
  syncConnectionOptions: DbConnectionConfig[];
  activeSchemaDiffTargetConnection: DbConnectionConfig | null;
  activeSyncSourceConnection: DbConnectionConfig;
  activeSyncTargetConnection: DbConnectionConfig;
}

export function buildWorkbenchConnectionContext(
  input: BuildWorkbenchConnectionContextInput,
): WorkbenchConnectionContext {
  const connectionOptions =
    input.connections.length > 0 ? input.connections : [input.connection];
  const activeSchemaDiffTargetConnection =
    input.connections.find(
      (item) => item.id === input.schemaDiffTargetConnectionId,
    ) ?? null;
  const activeSyncSourceConnection =
    connectionOptions.find((item) => item.id === input.syncSourceConnectionId) ??
    input.connection;
  const activeSyncTargetConnection =
    connectionOptions.find((item) => item.id === input.syncTargetConnectionId) ??
    input.connection;

  return {
    sourceConnectionLabel: input.connection.name || input.connection.database,
    schemaDiffTargetConnectionLabel:
      activeSchemaDiffTargetConnection?.name ?? null,
    schemaDiffConnectionOptions: connectionOptions,
    syncConnectionOptions: connectionOptions,
    activeSchemaDiffTargetConnection,
    activeSyncSourceConnection,
    activeSyncTargetConnection,
  };
}
