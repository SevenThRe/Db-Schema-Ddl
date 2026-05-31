import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DbConnectionConfig } from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";
import {
  buildConnectionGroupSections,
  type ConnectionEnvironmentFilter,
} from "./workbench-connection-config-model";

export function useDbConnectorConnectionState({
  host,
  discoveryEnabled,
  toast,
  onConnectionSaved,
  onConnectionDeleted,
}: {
  host: HostApi;
  discoveryEnabled: boolean;
  toast: HostApi["notifications"]["show"];
  onConnectionSaved: (savedConfig: DbConnectionConfig) => void;
  onConnectionDeleted: (deletedId: string) => void;
}) {
  const qc = useQueryClient();
  const [connectionSearch, setConnectionSearch] = useState("");
  const [environmentFilter, setEnvironmentFilter] =
    useState<ConnectionEnvironmentFilter>("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["/db/connections"],
    queryFn: () => host.connections.list(),
  });

  const {
    data: discoveredEndpoints = [],
    isFetching: isDiscoveringLocal,
    error: discoveredEndpointsError,
    refetch: refetchDiscoveredEndpoints,
  } = useQuery({
    queryKey: ["/db/connections/discover-local"],
    queryFn: () => host.connections.discoverLocal(),
    enabled: discoveryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const groupedConnections = useMemo(() => {
    return buildConnectionGroupSections(connections, {
      search: connectionSearch,
      environment: environmentFilter,
      favoriteOnly,
    });
  }, [connectionSearch, connections, environmentFilter, favoriteOnly]);

  const saveMutation = useMutation({
    mutationFn: (config: DbConnectionConfig) => host.connections.save(config),
    onSuccess: (savedConfig) => {
      void qc.invalidateQueries({ queryKey: ["/db/connections"] });
      onConnectionSaved(savedConfig);
      toast({ title: "已保存", variant: "success" });
    },
    onError: (e) =>
      toast({ title: "保存失败", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => host.connections.remove(id),
    onSuccess: (_result, deletedId) => {
      void qc.invalidateQueries({ queryKey: ["/db/connections"] });
      onConnectionDeleted(deletedId);
      toast({ title: "已删除", variant: "success" });
    },
    onError: (e) =>
      toast({ title: "删除失败", description: String(e), variant: "destructive" }),
  });

  return {
    connections,
    isLoading,
    discoveredEndpoints,
    discoveredEndpointsError,
    isDiscoveringLocal,
    refetchDiscoveredEndpoints,
    groupedConnections,
    connectionSearch,
    setConnectionSearch,
    environmentFilter,
    setEnvironmentFilter,
    favoriteOnly,
    setFavoriteOnly,
    saveConnection: saveMutation.mutate,
    saveConnectionAsync: saveMutation.mutateAsync,
    deleteConnection: deleteMutation.mutate,
  };
}
