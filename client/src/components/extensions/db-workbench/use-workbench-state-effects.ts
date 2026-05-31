import {
  type Dispatch,
  type SetStateAction,
  useEffect,
} from "react";
import type {
  DdlSettings,
} from "@shared/schema";

import type { DataDiffStateActions } from "./data-sync-runner";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import type { SchemaDiffStateActions } from "./schema-diff-runner";
import type { WorkbenchSchemaStateActions } from "./workbench-schema-state-runner";
import {
  runClearDataSyncArtifacts,
  runReconcileDataSyncTables,
  runResolveDataSyncConnections,
  runResolveSchemaDiffTarget,
  runResetSchemaDiffForConnection,
  runResetSchemaDiffForTarget,
  type SyncConnectionStateActions,
} from "./workbench-sync-state-runner";

type ConnectionIdentity = {
  id: string;
};

export interface UseWorkbenchStateEffectsInput {
  activeConnectionId: string;
  activeDriver: string;
  connections: ConnectionIdentity[];
  schemaDiffTargetConnectionId: string;
  schemaDiffStateActions: SchemaDiffStateActions;
  syncSourceConnectionId: string;
  syncTargetConnectionId: string;
  syncConnectionStateActions: SyncConnectionStateActions;
  syncAvailableTableNames: string[];
  selectedTableName: string | null;
  setSyncSelectedTables: Dispatch<SetStateAction<string[]>>;
  setSyncTableConfigs: Dispatch<SetStateAction<Record<string, SyncTableConfigDraft>>>;
  dataDiffStateActions: DataDiffStateActions;
  schemaStateActions: WorkbenchSchemaStateActions;
  schemaErrorMessage: string | null;
  schemaOptionsError: unknown;
  ddlSettings: DdlSettings | undefined;
  ddlSettingsError: unknown;
  schemaTables: Array<{ name: string }> | undefined;
}

export function useWorkbenchStateEffects({
  activeConnectionId,
  activeDriver,
  connections,
  schemaDiffTargetConnectionId,
  schemaDiffStateActions,
  syncSourceConnectionId,
  syncTargetConnectionId,
  syncConnectionStateActions,
  syncAvailableTableNames,
  selectedTableName,
  setSyncSelectedTables,
  setSyncTableConfigs,
  dataDiffStateActions,
  schemaStateActions,
  schemaErrorMessage,
  schemaOptionsError,
  ddlSettings,
  ddlSettingsError,
  schemaTables,
}: UseWorkbenchStateEffectsInput): void {
  useEffect(() => {
    runResolveSchemaDiffTarget({
      activeConnectionId,
      connections,
      setSchemaDiffTargetConnectionId: schemaDiffStateActions.applyTargetConnectionId,
    });
  }, [activeConnectionId, connections, schemaDiffStateActions]);

  useEffect(() => {
    runResetSchemaDiffForConnection(schemaDiffStateActions);
  }, [activeConnectionId, schemaDiffStateActions]);

  useEffect(() => {
    runResetSchemaDiffForTarget(schemaDiffStateActions);
  }, [schemaDiffStateActions, schemaDiffTargetConnectionId]);

  useEffect(() => {
    runResolveDataSyncConnections({
      activeConnectionId,
      currentSourceConnectionId: syncSourceConnectionId,
      currentTargetConnectionId: syncTargetConnectionId,
      connections,
      setSyncSourceConnectionId: syncConnectionStateActions.setSourceConnectionId,
      setSyncTargetConnectionId: syncConnectionStateActions.setTargetConnectionId,
    });
  }, [
    activeConnectionId,
    connections,
    syncConnectionStateActions,
    syncSourceConnectionId,
    syncTargetConnectionId,
  ]);

  useEffect(() => {
    schemaStateActions.notifySchemaLoadFailure(schemaErrorMessage);
  }, [schemaErrorMessage, schemaStateActions]);

  useEffect(() => {
    schemaStateActions.notifySchemaOptionsFailure(activeDriver, schemaOptionsError);
  }, [activeDriver, schemaOptionsError, schemaStateActions]);

  useEffect(() => {
    schemaStateActions.applyDdlSettingsToSqlCopilotDraft(ddlSettings);
  }, [ddlSettings, schemaStateActions]);

  useEffect(() => {
    schemaStateActions.notifyDdlSettingsFailure(ddlSettingsError);
  }, [ddlSettingsError, schemaStateActions]);

  useEffect(() => {
    schemaStateActions.resolveSelectedTableForSchema(schemaTables);
  }, [schemaTables, schemaStateActions]);

  useEffect(() => {
    runReconcileDataSyncTables({
      availableTableNames: syncAvailableTableNames,
      selectedTableName,
      setSyncSelectedTables,
      setSyncTableConfigs,
    });
  }, [
    selectedTableName,
    setSyncSelectedTables,
    setSyncTableConfigs,
    syncAvailableTableNames,
  ]);

  useEffect(() => {
    runClearDataSyncArtifacts(dataDiffStateActions);
  }, [dataDiffStateActions, syncSourceConnectionId, syncTargetConnectionId]);
}
