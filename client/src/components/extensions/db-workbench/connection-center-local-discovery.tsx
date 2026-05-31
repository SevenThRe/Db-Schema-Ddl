import {
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DbConnectionConfig, DbDiscoveredEndpoint } from "@shared/schema";

export function LocalDiscoveryPanel({
  connections,
  discoveredEndpoints,
  discoveredEndpointsError,
  isDiscoveringLocal,
  onRefreshDiscoveredEndpoints,
  onActivateConnection,
  onPrefillDiscoveredConnection,
}: {
  connections: DbConnectionConfig[];
  discoveredEndpoints: DbDiscoveredEndpoint[];
  discoveredEndpointsError: unknown;
  isDiscoveringLocal: boolean;
  onRefreshDiscoveredEndpoints: () => void;
  onActivateConnection: (connectionId: string) => void;
  onPrefillDiscoveredConnection: (candidate: DbDiscoveredEndpoint) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-panel-muted/30 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">发现的本地数据库</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            仅探测本机默认 MySQL / PostgreSQL 端口；结果是候选端点，不会自动保存。
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={onRefreshDiscoveredEndpoints}
          disabled={isDiscoveringLocal}
        >
          {isDiscoveringLocal ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          重新扫描
        </Button>
      </div>

      <div className="mt-2 space-y-1.5">
        {isDiscoveringLocal && discoveredEndpoints.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在扫描本机默认数据库端口…
          </div>
        ) : discoveredEndpointsError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
            本地数据库扫描失败：{String(discoveredEndpointsError)}
          </div>
        ) : discoveredEndpoints.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
            暂未发现本机默认 MySQL / PostgreSQL 实例。你仍然可以手动添加连接。
          </div>
        ) : discoveredEndpoints.map((candidate) => {
          const existingConnection = connections.find((connection) =>
            connection.driver === candidate.driver
            && connection.host === candidate.host
            && connection.port === candidate.port
          );

          return (
            <div
              key={candidate.id}
              className="rounded-md border border-border bg-background px-2.5 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-medium text-foreground">
                      {candidate.label}
                    </p>
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      {candidate.driver}
                    </Badge>
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      {candidate.confidence}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {candidate.host}:{candidate.port}
                    {candidate.databaseHint ? `/${candidate.databaseHint}` : ""}
                    {candidate.usernameHint ? ` · ${candidate.usernameHint}` : ""}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {candidate.detail}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    来源：{candidate.source}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {existingConnection ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onActivateConnection(existingConnection.id)}
                    >
                      打开已保存
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => onPrefillDiscoveredConnection(candidate)}
                  >
                    填入连接
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
