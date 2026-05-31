import type { WorkbenchWorkspaceBodyProps } from "./WorkbenchWorkspaceBody";
import { buildWorkbenchWorkspaceBodyProps } from "./workbench-workspace-body-props";
import type {
  BuildWorkbenchLayoutRenderPropsInput,
} from "./workbench-layout-render-props-contract";
import type { WorkbenchRenderContext } from "./workbench-render-context";

export function buildWorkbenchLayoutWorkspaceBodyProps({
  input,
  renderContext,
  resultWorkspaceProps,
}: {
  input: BuildWorkbenchLayoutRenderPropsInput;
  renderContext: WorkbenchRenderContext;
  resultWorkspaceProps: WorkbenchWorkspaceBodyProps["resultWorkspace"];
}) {
  return buildWorkbenchWorkspaceBodyProps({
    sidebarMode: input.sidebarMode,
    connection: input.connection,
    activeTabId: input.activeTab?.id ?? "",
    activeTabSql: input.activeTab?.sql ?? "",
    isExecuting: input.isExecuting,
    isExporting: input.isExporting,
    sidebar: {
      connections: input.connections,
      onSwitchConnection: input.handleSwitchConnection,
      activeSchema: input.runtimeSchema ?? undefined,
      schemaOptions: input.schemaOptions,
      isSchemaListLoading: input.isSchemaOptionsLoading,
      onSchemaChange: input.handleSchemaChange,
      schemaSnapshot: input.schemaSnapshot,
      schemaError: input.schemaErrorMessage,
      isSchemaLoading: input.isSchemaLoading,
      refetchSchema: input.refetchSchema,
      refetchSchemaOptions: input.refetchSchemaOptions,
      selectedTableName: input.selectedTableName,
      inspectedObjectKind: renderContext.inspectedObjectKind,
      inspectedObjectName: renderContext.inspectedObjectName,
      inspectedObjectSignature: renderContext.inspectedObjectSignature,
      inspectedParentObjectName: renderContext.inspectedParentObjectName,
      onSelectTable: input.handleSelectTable,
      onOpenTable: input.handleOpenTable,
      onInspectObject: input.handleInspectObject,
      onRunStarterQuery: input.handleRunStarterQuery,
    },
    queryTabs: {
      tabs: input.tabs,
      onTabChange: input.handleTabChange,
      onTabAdd: input.handleTabAdd,
      onTabClose: input.handleTabClose,
      onTabRename: input.handleTabRename,
    },
    sqlToolStrip: {
      savedSnippetCount: input.savedSnippets.length,
      queryHistoryCount: input.queryHistory.length,
      recentQueryCount: input.recentQueries.length,
      sqlMemoryPatternCount: input.sqlMemory.queryPatterns.length,
      sqlMemoryGroundedCount: input.sqlMemory.valueProfiles.length,
      sqlCopilotProvider: input.effectiveDdlSettings.sqlCopilotProvider,
      sqlCopilotEnabled: input.effectiveDdlSettings.sqlCopilotEnabled,
      onOpenSqlLibrary: input.handleOpenSqlLibrary,
      onSaveSnippet: input.handleSaveSnippet,
      onOpenSqlMemory: input.handleOpenSqlMemory,
      onOpenSqlCopilot: input.handleOpenSqlCopilot,
    },
    editor: {
      autocompleteContext: input.autocompleteContext,
      onCompletionAccepted: input.handleCompletionAccepted,
      onSqlChange: input.handleSqlChange,
      onExecuteSelection: input.handleExecuteSelection,
      onExecuteScript: input.handleExecuteScript,
      onExplain: input.handleExplain,
      onCancel: input.handleCancel,
      onCloseTab: input.handleCloseActiveTab,
    },
    resultWorkspace: resultWorkspaceProps,
  });
}
