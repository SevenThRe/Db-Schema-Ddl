import { ScrollArea } from "@/components/ui/scroll-area";
import type { DbConnectionConfig, DbDiscoveredEndpoint } from "@shared/schema";
import {
  ConnectionCenterFilterBar,
  ConnectionCenterHeader,
  ConnectionGroupList,
  LocalDiscoveryPanel,
} from "./connection-center-sections";
import type {
  ConnectionEnvironmentFilter,
  ConnectionGroupSection,
} from "./workbench-connection-config-model";

type ConnectionCenterViewProps = {
  activeConnection: DbConnectionConfig | null;
  connections: DbConnectionConfig[];
  selectedConnId: string | null;
  isLoading: boolean;
  discoveredEndpoints: DbDiscoveredEndpoint[];
  discoveredEndpointsError: unknown;
  isDiscoveringLocal: boolean;
  groupedConnections: ConnectionGroupSection[];
  connectionSearch: string;
  environmentFilter: ConnectionEnvironmentFilter;
  favoriteOnly: boolean;
  onAddConnection: () => void;
  onReturnToWorkspace: () => void;
  onRefreshDiscoveredEndpoints: () => void;
  onActivateConnection: (connectionId: string) => void;
  onPrefillDiscoveredConnection: (candidate: DbDiscoveredEndpoint) => void;
  onConnectionSearchChange: (value: string) => void;
  onEnvironmentFilterChange: (value: ConnectionEnvironmentFilter) => void;
  onFavoriteOnlyChange: (value: boolean) => void;
  onEditConnection: (connection: DbConnectionConfig) => void;
  onDuplicateConnection: (connection: DbConnectionConfig) => void;
  onDeleteConnection: (connectionId: string) => void;
};

export function ConnectionCenterView({
  activeConnection,
  connections,
  selectedConnId,
  isLoading,
  discoveredEndpoints,
  discoveredEndpointsError,
  isDiscoveringLocal,
  groupedConnections,
  connectionSearch,
  environmentFilter,
  favoriteOnly,
  onAddConnection,
  onReturnToWorkspace,
  onRefreshDiscoveredEndpoints,
  onActivateConnection,
  onPrefillDiscoveredConnection,
  onConnectionSearchChange,
  onEnvironmentFilterChange,
  onFavoriteOnlyChange,
  onEditConnection,
  onDuplicateConnection,
  onDeleteConnection,
}: ConnectionCenterViewProps) {
  const resultCount = groupedConnections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <ConnectionCenterHeader
        activeConnection={activeConnection}
        onAddConnection={onAddConnection}
        onReturnToWorkspace={onReturnToWorkspace}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 px-3 pb-3">
          <LocalDiscoveryPanel
            connections={connections}
            discoveredEndpoints={discoveredEndpoints}
            discoveredEndpointsError={discoveredEndpointsError}
            isDiscoveringLocal={isDiscoveringLocal}
            onRefreshDiscoveredEndpoints={onRefreshDiscoveredEndpoints}
            onActivateConnection={onActivateConnection}
            onPrefillDiscoveredConnection={onPrefillDiscoveredConnection}
          />

          <ConnectionCenterFilterBar
            connectionSearch={connectionSearch}
            environmentFilter={environmentFilter}
            favoriteOnly={favoriteOnly}
            resultCount={resultCount}
            totalConnectionCount={connections.length}
            onConnectionSearchChange={onConnectionSearchChange}
            onEnvironmentFilterChange={onEnvironmentFilterChange}
            onFavoriteOnlyChange={onFavoriteOnlyChange}
          />

          <ConnectionGroupList
            connections={connections}
            groupedConnections={groupedConnections}
            selectedConnId={selectedConnId}
            isLoading={isLoading}
            onActivateConnection={onActivateConnection}
            onEditConnection={onEditConnection}
            onDuplicateConnection={onDuplicateConnection}
            onDeleteConnection={onDeleteConnection}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
