import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHostApiFor } from "@/extensions/host-context";
import type { ExtensionSidebarViewProps } from "@/extensions/sidebar-view-registry";
import {
  dispatchDbConnectorConnectionSelection,
  readStoredDbConnectorConnectionId,
  subscribeDbConnectorConnectionSelection,
} from "./db-connector-sidebar-events";
import { Database, Loader2, Star } from "lucide-react";

export function DbConnectionsSidebarView({
  extensionId,
  workbenchViewId,
  onOpenWorkbenchView,
}: ExtensionSidebarViewProps) {
  const host = useHostApiFor(extensionId);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(() =>
    readStoredDbConnectorConnectionId(),
  );

  useEffect(
    () => subscribeDbConnectorConnectionSelection((connectionId) => setSelectedConnectionId(connectionId)),
    [],
  );

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["db-connector", "sidebar", "connections"],
    queryFn: () => host.connections.list(),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          Connections
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Saved database connections stay selectable from the host-managed sidebar.
        </p>
      </div>

      {isLoading ? (
        <div className="flex min-h-[160px] items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading connections...
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200/80 bg-white/70 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
          No saved connections yet.
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((connection) => {
            const isActive = connection.id === selectedConnectionId;
            return (
              <button
                key={connection.id}
                type="button"
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-blue-300 bg-blue-50 text-slate-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-slate-50"
                    : "border-slate-200/80 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900",
                )}
                onClick={() => {
                  setSelectedConnectionId(connection.id);
                  dispatchDbConnectorConnectionSelection(connection.id);
                  onOpenWorkbenchView(workbenchViewId);
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-semibold">
                        {connection.name || connection.database}
                      </p>
                      {connection.favorite ? (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {connection.driver}://{connection.host}:{connection.port}/{connection.database}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                        {connection.driver}
                      </Badge>
                      {connection.environment ? (
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                          {connection.environment}
                        </Badge>
                      ) : null}
                      {connection.readonly ? (
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                          readonly
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full text-xs"
        onClick={() => onOpenWorkbenchView(workbenchViewId)}
      >
        Open Database Workspace
      </Button>
    </div>
  );
}
