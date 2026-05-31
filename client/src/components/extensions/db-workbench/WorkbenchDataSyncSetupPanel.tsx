import type {
  DbConnectionConfig,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import type {
  SyncTableConfigDraft,
  SyncTableMetadataIndex,
} from "./data-sync-utils";
import {
  DataSyncConnectionSelectorBar,
  DataSyncRouteSummary,
  DataSyncSelectedTableConfigs,
  DataSyncTablePicker,
} from "./workbench-data-sync-setup-sections";

interface WorkbenchDataSyncSetupPanelProps {
  activeSyncSourceConnection: DbConnectionConfig;
  activeSyncTargetConnection: DbConnectionConfig;
  diffPreview: DbDataDiffPreviewResponse | null;
  syncConnectionOptions: DbConnectionConfig[];
  connectionCount: number;
  activeConnectionId: string;
  syncSourceConnectionId: string;
  syncTargetConnectionId: string;
  onSourceConnectionChange: (connectionId: string) => void;
  onTargetConnectionChange: (connectionId: string) => void;
  onPreviewDataDiff: () => void;
  isDiffPreviewing: boolean;
  isSyncSchemaLoading: boolean;
  syncSchemaIssueMessage: string | null;
  syncAvailableTableNames: string[];
  syncSelectedTables: string[];
  onToggleSyncTable: (tableName: string) => void;
  syncTableMetadataByName: SyncTableMetadataIndex;
  syncTableConfigs: Record<string, SyncTableConfigDraft>;
  onSyncTableConfigChange: (
    tableName: string,
    field: keyof SyncTableConfigDraft,
    value: string,
  ) => void;
}

export function WorkbenchDataSyncSetupPanel({
  activeSyncSourceConnection,
  activeSyncTargetConnection,
  diffPreview,
  syncConnectionOptions,
  connectionCount,
  activeConnectionId,
  syncSourceConnectionId,
  syncTargetConnectionId,
  onSourceConnectionChange,
  onTargetConnectionChange,
  onPreviewDataDiff,
  isDiffPreviewing,
  isSyncSchemaLoading,
  syncSchemaIssueMessage,
  syncAvailableTableNames,
  syncSelectedTables,
  onToggleSyncTable,
  syncTableMetadataByName,
  syncTableConfigs,
  onSyncTableConfigChange,
}: WorkbenchDataSyncSetupPanelProps) {
  return (
    <>
      <DataSyncRouteSummary
        activeSyncSourceConnection={activeSyncSourceConnection}
        activeSyncTargetConnection={activeSyncTargetConnection}
        diffPreview={diffPreview}
      />

      <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-2">
        <DataSyncConnectionSelectorBar
          syncConnectionOptions={syncConnectionOptions}
          connectionCount={connectionCount}
          activeConnectionId={activeConnectionId}
          syncSourceConnectionId={syncSourceConnectionId}
          syncTargetConnectionId={syncTargetConnectionId}
          onSourceConnectionChange={onSourceConnectionChange}
          onTargetConnectionChange={onTargetConnectionChange}
          onPreviewDataDiff={onPreviewDataDiff}
          isDiffPreviewing={isDiffPreviewing}
          isSyncSchemaLoading={isSyncSchemaLoading}
          syncSchemaIssueMessage={syncSchemaIssueMessage}
          syncSelectedTableCount={syncSelectedTables.length}
        />

        <DataSyncTablePicker
          syncAvailableTableNames={syncAvailableTableNames}
          syncSelectedTables={syncSelectedTables}
          onToggleSyncTable={onToggleSyncTable}
        />

        <DataSyncSelectedTableConfigs
          syncSchemaIssueMessage={syncSchemaIssueMessage}
          isSyncSchemaLoading={isSyncSchemaLoading}
          syncSelectedTables={syncSelectedTables}
          syncTableMetadataByName={syncTableMetadataByName}
          syncTableConfigs={syncTableConfigs}
          onSyncTableConfigChange={onSyncTableConfigChange}
        />
      </div>
    </>
  );
}
