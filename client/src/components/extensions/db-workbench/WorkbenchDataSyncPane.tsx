import type {
  DbBackgroundJobSummary,
  DbConnectionConfig,
  DbDataApplyExecuteResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import type {
  DataSyncRowDiffEntry,
  DataSyncSuggestedAction,
} from "./data-sync-row-diff";
import {
  type SyncTableConfigDraft,
  type SyncTableMetadataIndex,
} from "./data-sync-utils";
import { WorkbenchDataSyncApplyPanel } from "./WorkbenchDataSyncApplyPanel";
import { WorkbenchDataSyncDiffBrowser } from "./WorkbenchDataSyncDiffBrowser";
import { WorkbenchDataSyncSetupPanel } from "./WorkbenchDataSyncSetupPanel";
import { WorkbenchInlineIssue } from "./WorkbenchInlineIssue";

export interface WorkbenchDataSyncPaneProps {
  syncIssue: string | null;
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
  diffDetail: DbDataDiffDetailResponse | null;
  onLoadDataDiffDetail: (tableName: string) => void;
  syncIncludeUnchanged: boolean;
  onToggleIncludeUnchangedRows: (includeUnchanged: boolean) => void;
  diffRows: DataSyncRowDiffEntry[];
  selectedDiffRowIndex: number;
  onSelectDiffRow: (rowIndex: number) => void;
  onChangeSyncRowAction: (
    rowIndex: number,
    nextAction: DataSyncSuggestedAction,
  ) => void;
  activeDiffRow: DataSyncRowDiffEntry | null;
  applyReadyMessage: string;
  onPreviewDataApply: () => void;
  isApplyPreviewing: boolean;
  onExecuteDataApply: () => void;
  canExecuteDataApply: boolean;
  isExecutingApply: boolean;
  activeApplyJobId: string | null;
  onOpenJobCenterForJob: (jobId: string) => void;
  applyPreview: DbDataApplyPreviewResponse | null;
  applyPreviewHasBlockingGuard: boolean;
  applyPreviewHasUnsafeDeleteWarning: boolean;
  applyUnsafeDeleteConfirmed: boolean;
  onUnsafeDeleteConfirmedChange: (confirmed: boolean) => void;
  deleteWarningThreshold: number;
  syncRequiresProdTypedConfirmation: boolean;
  applyProdConfirmation: string;
  onProdConfirmationChange: (confirmation: string) => void;
  applyExecute: DbDataApplyExecuteResponse | null;
  selectedBackgroundJob: DbBackgroundJobSummary | null;
}

export function WorkbenchDataSyncPane({
  syncIssue,
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
  diffDetail,
  onLoadDataDiffDetail,
  syncIncludeUnchanged,
  onToggleIncludeUnchangedRows,
  diffRows,
  selectedDiffRowIndex,
  onSelectDiffRow,
  onChangeSyncRowAction,
  activeDiffRow,
  applyReadyMessage,
  onPreviewDataApply,
  isApplyPreviewing,
  onExecuteDataApply,
  canExecuteDataApply,
  isExecutingApply,
  activeApplyJobId,
  onOpenJobCenterForJob,
  applyPreview,
  applyPreviewHasBlockingGuard,
  applyPreviewHasUnsafeDeleteWarning,
  applyUnsafeDeleteConfirmed,
  onUnsafeDeleteConfirmedChange,
  deleteWarningThreshold,
  syncRequiresProdTypedConfirmation,
  applyProdConfirmation,
  onProdConfirmationChange,
  applyExecute,
  selectedBackgroundJob,
}: WorkbenchDataSyncPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {syncIssue ? (
        <WorkbenchInlineIssue
          title="Data sync action failed"
          description={syncIssue}
        />
      ) : null}

      <WorkbenchDataSyncSetupPanel
        activeSyncSourceConnection={activeSyncSourceConnection}
        activeSyncTargetConnection={activeSyncTargetConnection}
        diffPreview={diffPreview}
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
        syncAvailableTableNames={syncAvailableTableNames}
        syncSelectedTables={syncSelectedTables}
        onToggleSyncTable={onToggleSyncTable}
        syncTableMetadataByName={syncTableMetadataByName}
        syncTableConfigs={syncTableConfigs}
        onSyncTableConfigChange={onSyncTableConfigChange}
      />

      <WorkbenchDataSyncDiffBrowser
        diffPreview={diffPreview}
        diffDetail={diffDetail}
        onLoadDataDiffDetail={onLoadDataDiffDetail}
        syncIncludeUnchanged={syncIncludeUnchanged}
        onToggleIncludeUnchangedRows={onToggleIncludeUnchangedRows}
        diffRows={diffRows}
        selectedDiffRowIndex={selectedDiffRowIndex}
        onSelectDiffRow={onSelectDiffRow}
        onChangeSyncRowAction={onChangeSyncRowAction}
        activeDiffRow={activeDiffRow}
      />

      <WorkbenchDataSyncApplyPanel
        applyReadyMessage={applyReadyMessage}
        onPreviewDataApply={onPreviewDataApply}
        isApplyPreviewing={isApplyPreviewing}
        onExecuteDataApply={onExecuteDataApply}
        canExecuteDataApply={canExecuteDataApply}
        isExecutingApply={isExecutingApply}
        activeApplyJobId={activeApplyJobId}
        onOpenJobCenterForJob={onOpenJobCenterForJob}
        diffPreview={diffPreview}
        applyPreview={applyPreview}
        applyPreviewHasBlockingGuard={applyPreviewHasBlockingGuard}
        applyPreviewHasUnsafeDeleteWarning={applyPreviewHasUnsafeDeleteWarning}
        applyUnsafeDeleteConfirmed={applyUnsafeDeleteConfirmed}
        onUnsafeDeleteConfirmedChange={onUnsafeDeleteConfirmedChange}
        deleteWarningThreshold={deleteWarningThreshold}
        syncRequiresProdTypedConfirmation={syncRequiresProdTypedConfirmation}
        activeSyncTargetConnection={activeSyncTargetConnection}
        applyProdConfirmation={applyProdConfirmation}
        onProdConfirmationChange={onProdConfirmationChange}
        applyExecute={applyExecute}
        selectedBackgroundJob={selectedBackgroundJob}
      />
    </div>
  );
}
