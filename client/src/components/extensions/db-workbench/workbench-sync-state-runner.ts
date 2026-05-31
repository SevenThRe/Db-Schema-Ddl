import type { Dispatch, SetStateAction } from "react";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import {
  pruneSyncTableConfigs,
  resolveSyncSelectedTables,
} from "./data-sync-utils";
import {
  resolveSchemaDiffTargetConnectionId,
  resolveSyncConnectionIds,
} from "./workbench-connection-routing";

type ConnectionIdentity = {
  id: string;
};

export interface SyncConnectionStateActions {
  setSourceConnectionId: (connectionId: string) => void;
  setTargetConnectionId: (connectionId: string) => void;
}

export function createSyncConnectionStateActions(input: {
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
}): SyncConnectionStateActions {
  return {
    setSourceConnectionId: input.setSyncSourceConnectionId,
    setTargetConnectionId: input.setSyncTargetConnectionId,
  };
}

export function runResolveSchemaDiffTarget(input: {
  activeConnectionId: string;
  connections: ConnectionIdentity[];
  setSchemaDiffTargetConnectionId: Dispatch<SetStateAction<string>>;
}): boolean {
  if (input.connections.length === 0) return false;

  input.setSchemaDiffTargetConnectionId((current) =>
    resolveSchemaDiffTargetConnectionId({
      currentTargetConnectionId: current,
      activeConnectionId: input.activeConnectionId,
      connections: input.connections,
    }),
  );
  return true;
}

export function runResetSchemaDiffForConnection(input: {
  resetState: () => void;
  finishCompare: () => void;
}): void {
  input.resetState();
  input.finishCompare();
}

export function runResetSchemaDiffForTarget(input: {
  resetState: () => void;
}): void {
  input.resetState();
}

export function runResolveDataSyncConnections(input: {
  activeConnectionId: string;
  currentSourceConnectionId: string;
  currentTargetConnectionId: string;
  connections: ConnectionIdentity[];
  setSyncSourceConnectionId: (connectionId: string) => void;
  setSyncTargetConnectionId: (connectionId: string) => void;
}): boolean {
  if (input.connections.length === 0) return false;

  const next = resolveSyncConnectionIds({
    activeConnectionId: input.activeConnectionId,
    currentSourceConnectionId: input.currentSourceConnectionId,
    currentTargetConnectionId: input.currentTargetConnectionId,
    connections: input.connections,
  });

  let changed = false;
  if (next.sourceConnectionId !== input.currentSourceConnectionId) {
    input.setSyncSourceConnectionId(next.sourceConnectionId);
    changed = true;
  }
  if (next.targetConnectionId !== input.currentTargetConnectionId) {
    input.setSyncTargetConnectionId(next.targetConnectionId);
    changed = true;
  }
  return changed;
}

export function runReconcileDataSyncTables(input: {
  availableTableNames: string[];
  selectedTableName: string | null;
  setSyncSelectedTables: Dispatch<SetStateAction<string[]>>;
  setSyncTableConfigs: Dispatch<SetStateAction<Record<string, SyncTableConfigDraft>>>;
}): void {
  input.setSyncSelectedTables((current) =>
    resolveSyncSelectedTables({
      currentSelectedTables: current,
      availableTableNames: input.availableTableNames,
      selectedTableName: input.selectedTableName,
    }),
  );
  input.setSyncTableConfigs((current) =>
    pruneSyncTableConfigs(current, input.availableTableNames),
  );
}

export function runClearDataSyncArtifacts(input: {
  clearArtifacts: () => void;
}): void {
  input.clearArtifacts();
}
