import { buildWorkbenchConnectionContext } from "./workbench-connection-context";
import { buildWorkbenchDataSyncProps } from "./workbench-data-sync-props";
import { buildWorkbenchQueryResultsProps } from "./workbench-query-results-props";
import { buildWorkbenchResultWorkspaceProps } from "./workbench-result-workspace-props";
import { buildWorkbenchSecondaryPaneProps } from "./workbench-secondary-pane-props";
import type {
  BuildWorkbenchLayoutRenderPropsInput,
} from "./workbench-layout-render-props-contract";
import type { WorkbenchRenderContext } from "./workbench-render-context";

export function buildWorkbenchLayoutResultWorkspaceProps({
  input,
  renderContext,
}: {
  input: BuildWorkbenchLayoutRenderPropsInput;
  renderContext: WorkbenchRenderContext;
}) {
  const activeDiffRow = input.diffRows[input.selectedDiffRowIndex] ?? null;
  const workbenchConnectionContext = buildWorkbenchConnectionContext({
    connection: input.connection,
    connections: input.connections,
    schemaDiffTargetConnectionId: input.schemaDiffTargetConnectionId,
    syncSourceConnectionId: input.syncSourceConnectionId,
    syncTargetConnectionId: input.syncTargetConnectionId,
  });
  const secondaryPaneProps = buildWorkbenchSecondaryPaneProps({
    schemaDiff: {
      sourceConnection: input.connection,
      connections: workbenchConnectionContext.schemaDiffConnectionOptions,
      targetConnectionId: input.schemaDiffTargetConnectionId,
      onTargetConnectionChange:
        input.schemaDiffStateActions.setTargetConnectionId,
      onCompare: input.handlePreviewSchemaDiff,
      isComparing: input.isSchemaDiffing,
      issue: input.schemaDiffIssue,
      sourceSnapshot: input.schemaDiffSourceSnapshot,
      targetSnapshot: input.schemaDiffTargetSnapshot,
      result: input.schemaDiffResult,
      onReset: input.schemaDiffStateActions.resetState,
    },
    inspection: {
      inspection: input.objectInspection,
      isLoading: input.isInspectingObject,
      error: input.inspectError,
      onInspectObject: input.handleInspectObject,
      onOpenTable: input.handleOpenTable,
    },
    jobs: {
      jobs: input.backgroundJobs,
      selectedJobId: input.selectedJobId,
      selectedJobDetail: input.applyJobDetail,
      connections: input.connections,
      activeConnectionId: input.connection.id,
      isRefreshing: input.isRefreshingJobs,
      issue: input.jobCenterIssue,
      onRefresh: input.refreshBackgroundJobs,
      onSelectJob: input.jobCenterStateActions.setSelectedJobId,
      onReopenSyncContext: input.handleReopenSyncContext,
    },
  });

  return buildWorkbenchResultWorkspaceProps({
    resultTab: input.resultTab,
    header: {
      resultTab: input.resultTab,
      onResultTabChange: input.resultWorkspaceStateActions.selectResultTab,
      activeBatch: renderContext.activeBatch ?? null,
      onExport: input.handleExport,
      isExporting: input.isExporting,
      sourceConnectionLabel: workbenchConnectionContext.sourceConnectionLabel,
      targetConnectionLabel:
        workbenchConnectionContext.schemaDiffTargetConnectionLabel,
      inspectionDisplayName: input.objectInspection?.displayName,
    },
    queryResults: buildWorkbenchQueryResultsProps({
      queryError: input.queryError,
      results: input.results,
      activeBatch: renderContext.activeBatch,
      schemaSnapshot: input.schemaSnapshot,
      lastGridEditSource: input.lastGridEditSource,
      activeIndex: input.activeBatchIndex,
      onActiveIndexChange: input.setActiveBatchIndex,
      onLoadMore: input.handleLoadMore,
      isLoading: input.isExecuting,
      stopOnError: input.stopOnError,
      onStopOnErrorChange: input.setStopOnError,
      pendingEditCells: input.pendingEditCells,
      pendingEditRows: renderContext.pendingEditRows,
      pendingInsertedRows: input.pendingInsertedRows,
      pendingDeleteRows: input.pendingDeleteRows,
      pendingInsertedCount: renderContext.pendingInsertedCount,
      pendingDeletedRows: renderContext.pendingDeletedRows,
      pendingEditCount: renderContext.pendingEditCount,
      pendingDeleteCount: renderContext.pendingDeleteCount,
      onEditCell: input.handleEditCell,
      onRevertCell: input.handleRevertGridCell,
      onRevertRow: input.handleRevertGridRow,
      onAddInsertedRow: input.handleAddInsertedGridRow,
      onEditInsertedRowValue: input.handleEditInsertedGridRowValue,
      onDiscardInsertedRow: input.handleDiscardInsertedGridRow,
      onStageDeleteRow: input.handleStageDeleteGridRow,
      onRevertDeleteRow: input.handleRevertGridDelete,
      onPrepareCommit: input.handlePrepareGridCommit,
      onDiscardEdits: input.handleDiscardGridEdits,
    }),
    explain: {
      explainError: input.explainError,
      plan: input.explainPlan,
      isLoading: input.isExplaining,
    },
    schemaDiff: secondaryPaneProps.schemaDiff,
    inspection: secondaryPaneProps.inspection,
    jobs: secondaryPaneProps.jobs,
    sync: buildWorkbenchDataSyncProps({
      syncIssue: input.syncIssue,
      activeSyncSourceConnection:
        workbenchConnectionContext.activeSyncSourceConnection,
      activeSyncTargetConnection:
        workbenchConnectionContext.activeSyncTargetConnection,
      diffPreview: input.diffPreview,
      syncConnectionOptions: workbenchConnectionContext.syncConnectionOptions,
      connectionCount: input.connections.length,
      activeConnectionId: input.connection.id,
      syncSourceConnectionId: input.syncSourceConnectionId,
      syncTargetConnectionId: input.syncTargetConnectionId,
      onSourceConnectionChange:
        input.syncConnectionStateActions.setSourceConnectionId,
      onTargetConnectionChange:
        input.syncConnectionStateActions.setTargetConnectionId,
      onPreviewDataDiff: input.handlePreviewDataDiff,
      isDiffPreviewing: input.isDiffPreviewing,
      isSyncSchemaLoading: input.isSyncSchemaLoading,
      syncSchemaIssueMessage: input.syncSchemaIssueMessage,
      syncAvailableTableNames: input.syncAvailableTableNames,
      syncSelectedTables: input.syncSelectedTables,
      onToggleSyncTable: input.handleToggleSyncTable,
      syncTableMetadataByName: input.syncTableMetadataByName,
      syncTableConfigs: input.syncTableConfigs,
      onSyncTableConfigChange: input.handleSyncTableConfigChange,
      diffDetail: input.diffDetail,
      onLoadDataDiffDetail: input.handleLoadDataDiffDetail,
      syncIncludeUnchanged: input.syncIncludeUnchanged,
      onToggleIncludeUnchangedRows: input.handleToggleIncludeUnchangedRows,
      diffRows: input.diffRows,
      selectedDiffRowIndex: input.selectedDiffRowIndex,
      onSelectDiffRow: input.dataDiffStateActions.selectRow,
      onChangeSyncRowAction: input.handleChangeSyncRowAction,
      activeDiffRow,
      applyReadyMessage: input.dataSyncApplyReadyMessage,
      onPreviewDataApply: input.handlePreviewDataApply,
      isApplyPreviewing: input.isApplyPreviewing,
      onExecuteDataApply: input.handleExecuteDataApply,
      isExecutingApply: input.isExecutingApply,
      activeApplyJobId: input.activeApplyJobId,
      onOpenJobCenterForJob: input.handleOpenJobCenterForJob,
      applyPreview: input.applyPreview,
      applyUnsafeDeleteConfirmed: input.applyUnsafeDeleteConfirmed,
      onUnsafeDeleteConfirmedChange:
        input.dataApplyStateActions.setUnsafeDeleteConfirmed,
      deleteWarningThreshold: input.dataSyncDeleteWarningThreshold,
      applyProdConfirmation: input.applyProdConfirmation,
      onProdConfirmationChange:
        input.dataApplyStateActions.setProdConfirmation,
      applyExecute: input.applyExecute,
      selectedBackgroundJob: input.selectedBackgroundJob,
    }),
  });
}
