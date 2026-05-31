import { TabsContent } from "@/components/ui/tabs";
import type { HostApi } from "@/extensions/host-api";
import type {
  DbConnectionConfig,
  DbDiscoveredEndpoint,
} from "@shared/schema";
import { ConnectionCenterView } from "./ConnectionCenterView";
import { ConnectionForm } from "./ConnectionForm";
import {
  DbConnectorNoConnectionView,
} from "./DbConnectorWorkspaceShell";
import {
  SchemaCompatibilityView,
  SchemaDiffCompatibilityView,
} from "./WorkbenchCompatibilityViews";
import { WorkbenchLayout } from "./WorkbenchLayout";
import type {
  DbConnectorWorkspaceTabActions,
} from "./use-db-connector-workspace-actions";
import type { useDbConnectorCompatibilityState } from "./use-db-connector-compatibility-state";
import type { useDbConnectorConnectionState } from "./use-db-connector-connection-state";
import {
  normalizeConnectionConfig,
} from "./workbench-connection-config-model";

type DbConnectorConnectionState = ReturnType<typeof useDbConnectorConnectionState>;
type DbConnectorCompatibilityState = ReturnType<typeof useDbConnectorCompatibilityState>;

export function DbConnectorWorkspaceTabs({
  extensionId,
  host,
  sidebarMode,
  activeConnection,
  connections,
  selectedConnId,
  editingConfig,
  connectionState,
  compatibilityState,
  actions,
}: {
  extensionId: string;
  host: HostApi;
  sidebarMode: "host" | "embedded";
  activeConnection: DbConnectionConfig | null;
  connections: DbConnectionConfig[];
  selectedConnId: string | null;
  editingConfig: DbConnectionConfig | null;
  connectionState: DbConnectorConnectionState;
  compatibilityState: DbConnectorCompatibilityState;
  actions: DbConnectorWorkspaceTabActions;
}) {
  return (
    <>
      <TabsContent value="connections" className="mt-0 min-h-0 flex-1 overflow-hidden">
        {editingConfig ? (
          <div className="h-full overflow-y-auto">
            <ConnectionForm
              initial={editingConfig}
              onSave={(config) => connectionState.saveConnection(normalizeConnectionConfig(config))}
              onCancel={actions.cancelConnectionEdit}
              extensionId={extensionId}
            />
          </div>
        ) : (
          <ConnectionCenterView
            activeConnection={activeConnection}
            connections={connections}
            selectedConnId={selectedConnId}
            isLoading={connectionState.isLoading}
            discoveredEndpoints={connectionState.discoveredEndpoints}
            discoveredEndpointsError={connectionState.discoveredEndpointsError}
            isDiscoveringLocal={connectionState.isDiscoveringLocal}
            groupedConnections={connectionState.groupedConnections}
            connectionSearch={connectionState.connectionSearch}
            environmentFilter={connectionState.environmentFilter}
            favoriteOnly={connectionState.favoriteOnly}
            onAddConnection={actions.startNewConnectionDraft}
            onReturnToWorkspace={actions.returnToWorkspace}
            onRefreshDiscoveredEndpoints={() => void connectionState.refetchDiscoveredEndpoints()}
            onActivateConnection={actions.activateConnection}
            onPrefillDiscoveredConnection={actions.prefillDiscoveredConnection}
            onConnectionSearchChange={connectionState.setConnectionSearch}
            onEnvironmentFilterChange={connectionState.setEnvironmentFilter}
            onFavoriteOnlyChange={connectionState.setFavoriteOnly}
            onEditConnection={actions.editConnection}
            onDuplicateConnection={actions.duplicateConnection}
            onDeleteConnection={connectionState.deleteConnection}
          />
        )}
      </TabsContent>

      <TabsContent value="schema" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <SchemaCompatibilityView
          connections={connections}
          selectedConnId={selectedConnId}
          snapshot={compatibilityState.schema.snapshot}
          isIntrospecting={compatibilityState.schema.isIntrospecting}
          onSelectedConnectionChange={actions.selectSchemaConnection}
          onRefreshSchema={() => void compatibilityState.schema.refetchSchema()}
          onReturnToWorkspace={actions.returnToWorkspace}
        />
      </TabsContent>

      <TabsContent value="diff" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <SchemaDiffCompatibilityView
          connections={connections}
          diffSourceId={compatibilityState.diff.diffSourceId}
          diffTargetId={compatibilityState.diff.diffTargetId}
          diffResult={compatibilityState.diff.diffResult}
          diffSourceSnapshot={compatibilityState.diff.diffSourceSnapshot}
          diffTargetSnapshot={compatibilityState.diff.diffTargetSnapshot}
          isDiffing={compatibilityState.diff.isDiffing}
          onSourceChange={compatibilityState.diff.setDiffSourceId}
          onTargetChange={compatibilityState.diff.setDiffTargetId}
          onRunDiff={() => void compatibilityState.diff.runDiff()}
          onReset={compatibilityState.diff.clearDiff}
        />
      </TabsContent>

      <TabsContent value="sql" className="mt-0 min-h-0 flex-1 overflow-hidden">
        {activeConnection ? (
          <WorkbenchLayout
            connection={activeConnection}
            hostApi={host}
            onManageConnections={actions.openConnectionView}
            onSwitchConnection={actions.activateConnection}
            sidebarMode={sidebarMode}
          />
        ) : (
          <DbConnectorNoConnectionView
            onOpenConnectionView={actions.openConnectionView}
            onNewConnection={actions.startNewConnectionDraft}
          />
        )}
      </TabsContent>
    </>
  );
}
