import {
  ChevronRight,
  Copy,
  Database,
  Loader2,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DbConnectionConfig } from "@shared/schema";
import type { ConnectionGroupSection } from "./workbench-connection-config-model";

export function ConnectionGroupList({
  connections,
  groupedConnections,
  selectedConnId,
  isLoading,
  onActivateConnection,
  onEditConnection,
  onDuplicateConnection,
  onDeleteConnection,
}: {
  connections: DbConnectionConfig[];
  groupedConnections: ConnectionGroupSection[];
  selectedConnId: string | null;
  isLoading: boolean;
  onActivateConnection: (connectionId: string) => void;
  onEditConnection: (connection: DbConnectionConfig) => void;
  onDuplicateConnection: (connection: DbConnectionConfig) => void;
  onDeleteConnection: (connectionId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Database className="h-8 w-8 opacity-30" />
        <p className="text-xs">暂无连接，先添加一个数据库连接来启动工作台。</p>
      </div>
    );
  }

  if (groupedConnections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-3 py-10 text-center text-muted-foreground">
        <Search className="h-5 w-5 opacity-40" />
        <p className="text-xs">当前筛选条件下没有匹配的连接。</p>
      </div>
    );
  }

  return (
    <>
      {groupedConnections.map((section) => (
        <div key={section.groupName} className="rounded-md border border-border bg-panel-muted/10">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {section.groupName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {section.items.length} 个连接
              </p>
            </div>
            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
              group
            </Badge>
          </div>

          <div className="space-y-1.5 px-2 py-2">
            {section.items.map((conn) => {
              const isSelected = conn.id === selectedConnId;
              const displayName = conn.name || conn.database;
              return (
                <div
                  key={conn.id}
                  className={cn(
                    "rounded-md border border-border bg-background px-3 py-2",
                    isSelected && "border-primary/40 bg-primary/5",
                  )}
                  style={
                    conn.colorTag
                      ? { boxShadow: `inset 3px 0 0 ${conn.colorTag}` }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-2">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                      onClick={() => onActivateConnection(conn.id)}
                    >
                      <div className="flex w-full items-center gap-1.5">
                        <p className="truncate text-xs font-medium text-foreground">
                          {displayName}
                        </p>
                        {conn.favorite ? (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 w-full truncate font-mono text-[10px] text-muted-foreground">
                        {conn.driver}://{conn.host}:{conn.port}/{conn.database}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                          {conn.driver}
                        </Badge>
                        {conn.environment ? (
                          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                            {conn.environment}
                          </Badge>
                        ) : null}
                        {conn.readonly ? (
                          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                            readonly
                          </Badge>
                        ) : null}
                        {conn.defaultSchema ? (
                          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                            schema:{conn.defaultSchema}
                          </Badge>
                        ) : null}
                      </div>
                      {conn.notes ? (
                        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                          {conn.notes}
                        </p>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        aria-label={`编辑连接 ${displayName}`}
                        onClick={() => onEditConnection(conn)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 text-muted-foreground"
                        aria-label={`复制连接 ${displayName}`}
                        onClick={() => onDuplicateConnection(conn)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                        aria-label={`删除连接 ${displayName}`}
                        onClick={() => onDeleteConnection(conn.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
